#!/usr/bin/env node
/**
 * Release Gate 2 — browser import smoke.
 *
 *   node release-gate/gate2-browser.mjs
 *
 * Drives the `/gate` route twice against the real published artifacts: once
 * through the Vite dev server and once through a production build served by
 * `vite preview`. Dev pre-bundles dependencies with esbuild while the build
 * goes through Rollup, and the two disagree often enough that testing only one
 * is testing half the problem.
 *
 * Every spawned process is registered for teardown, so an exception, a failed
 * probe or a Ctrl-C all end with no orphaned server or browser.
 */

import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { readTarball, readManifest } from './lib/tar.mjs'

const here = import.meta.dirname
// The consumer app (TanStack Start) lives in app/. TanStack resolves its build
// output from the process cwd, so Vite runs from app/ with its own config.
const APP_DIR = join(here, 'app')
const VITE_BIN = join(here, 'node_modules', 'vite', 'bin', 'vite.js')
const resultsDir = join(here, '.results')
const artifactDir = join(here, 'artifacts')
const isWindows = process.platform === 'win32'

const DEV_PORT = 3178
const PREVIEW_PORT = 4178

/**
 * Colour codes in bundler output. Written as an escape rather than a literal
 * ESC byte, which is invisible in diffs and easy to lose on copy/paste.
 */
const ANSI = /\u001b\[\d+m/g

/** Kept in sync with IMPORTERS in probes.ts — only these can be skipped. */
const GATE_PACKAGES = new Set([
  '@naculus/connect',
  '@naculus/connect-core',
  '@naculus/connector-coinbase',
  '@naculus/connector-embedded',
  '@naculus/connector-evm-injected',
  '@naculus/connector-passkeys',
  '@naculus/connector-reown',
  '@naculus/connector-safe',
  '@naculus/connector-solana',
  '@naculus/connector-solana-kit',
  '@naculus/connector-wagmi',
  '@naculus/connector-walletconnect',
  '@naculus/connector-xrpl',
  '@naculus/payments-mpp',
  '@naculus/payments-x402',
  '@naculus/siwx',
  '@naculus/wallet-engine',
  '@naculus/connect-appkit-wc',
  '@naculus/connect-appkit-react',
  '@naculus/connect-appkit-vue',
  '@naculus/connect-appkit-ui',
])

// ── Process lifecycle ────────────────────────────────────────────────────

const children = new Set()
let browser = null
let teardownDone = false

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (isWindows) {
      // Killing the pnpm shim leaves the vite process behind; /T takes the tree.
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGKILL')
    }
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

async function teardown() {
  if (teardownDone) return
  teardownDone = true
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
  for (const child of children) killTree(child)
  children.clear()
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    teardown().finally(() => process.exit(130))
  })
}

/**
 * Last-resort synchronous sweep.
 *
 * Windows has no POSIX signals, so a `kill` from outside never reaches the
 * handlers above and the vite child would survive as an orphan holding its
 * port. `exit` fires for every termination Node can observe, and `taskkill` /
 * `process.kill` are synchronous, so the servers go down even when the async
 * teardown never got a chance to run.
 */
process.on('exit', () => {
  for (const child of children) killTree(child)
})
process.on('uncaughtException', (err) => {
  console.error('\n  uncaught:', err)
  teardown().finally(() => process.exit(1))
})

function startServer(label, args) {
  const child = spawn(process.execPath, [VITE_BIN, ...args], {
    cwd: APP_DIR,
    shell: isWindows,
    detached: !isWindows,
    env: {
      ...process.env,
      CI: 'true',
      npm_config_confirm_modules_purge: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)

  const log = []
  child.stdout.on('data', (d) => log.push(d.toString()))
  child.stderr.on('data', (d) => log.push(d.toString()))
  child.on('exit', () => children.delete(child))

  return { child, label, log }
}

async function waitForServer(url, server, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${server.label} exited early:\n${server.log.join('')}`)
    }
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status < 500) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${server.label} did not become ready within ${timeoutMs}ms:\n${server.log.join('')}`)
}

// ── Provenance: prove we are testing local artifacts ─────────────────────

/**
 * pnpm `overrides` does not rewrite the transitive dependencies of a package
 * installed from a `file:` tarball, so the umbrella's subtree resolves from the
 * public registry. Rather than fight that, verify the bytes: whatever the
 * browser will import from the tester root must be identical to the file inside
 * the tarball we just packed. Checking bytes beats trusting resolution config.
 */
function checkProvenance() {
  const mismatches = []
  let checked = 0

  for (const file of readdirSync(artifactDir)) {
    if (!file.endsWith('.tgz')) continue
    const entries = readTarball(join(artifactDir, file))
    const manifest = readManifest(entries)
    const main = (manifest.main ?? './index.js').replace(/^\.\//, '')

    const packed = entries.get(main)
    if (!packed) continue

    let installed
    try {
      installed = readFileSync(join(here, 'node_modules', manifest.name, main))
    } catch {
      mismatches.push(`${manifest.name}: ${main} not installed`)
      continue
    }

    const a = createHash('sha256').update(packed).digest('hex')
    const b = createHash('sha256').update(installed).digest('hex')
    checked += 1
    if (a !== b) {
      mismatches.push(`${manifest.name}: installed ${main} != packed artifact`)
    }
  }

  return { checked, mismatches }
}

// ── Probe run ────────────────────────────────────────────────────────────

async function runMode(label, url) {
  const context = await browser.newContext()
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForSelector('[data-gate-state="done"], [data-gate-state="error"]', {
    timeout: 180_000,
  })

  const report = await page.evaluate(() => window.__GATE_RESULT__ ?? null)
  const fatal = await page.evaluate(() => window.__GATE_ERROR__ ?? null)

  await context.close()

  if (!report) {
    throw new Error(`${label}: probes did not produce a report. Fatal: ${fatal ?? 'unknown'}`)
  }
  return { ...report, consoleErrors }
}

// ── Verdict ──────────────────────────────────────────────────────────────

function classifyAgainstExpectations(report, expectations) {
  const known = new Map(expectations.known.map((k) => [k.id, k]))
  const rows = []

  for (const r of report.results) {
    const expected = known.get(r.id)
    if (r.status === 'skip') {
      rows.push({ ...r, verdict: 'SKIP' })
    } else if (r.status === 'fail') {
      if (expected && expected.code === r.code) {
        rows.push({ ...r, verdict: 'KNOWN', finding: expected.finding })
      } else if (expected) {
        rows.push({
          ...r,
          verdict: 'FAIL',
          finding: expected.finding,
          note: `expected code "${expected.code}", got "${r.code}"`,
        })
      } else {
        rows.push({ ...r, verdict: 'FAIL' })
      }
    } else if (expected) {
      rows.push({ ...r, verdict: 'FIXED', finding: expected.finding })
    } else {
      rows.push({ ...r, verdict: 'PASS' })
    }
  }

  return rows
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(resultsDir, { recursive: true })

  const { chromium } = await import('@playwright/test')
  const expectations = JSON.parse(readFileSync(join(here, 'expectations.json'), 'utf8'))

  console.log('\nRelease Gate 2 — browser import smoke\n')

  const prov = checkProvenance()
  if (prov.mismatches.length) {
    console.error('  provenance FAILED — not testing local artifacts:')
    for (const m of prov.mismatches) console.error(`    ${m}`)
    console.error('\n  Run `pnpm gate:pack && pnpm gate:install` and try again.\n')
    process.exit(1)
  }
  console.log(`  provenance ok — ${prov.checked} package(s) match their packed artifact\n`)

  browser = await chromium.launch()

  const modes = []

  // ── dev ────────────────────────────────────────────────────────────────
  console.log('  [dev] starting vite dev server ...')
  // File tarballs are intentionally repacked during Gate 1. Force Vite to
  // discard an older optimizeDeps graph so a previous artifact cannot produce
  // stale 504s or named-export mismatches in the browser probe.
  const dev = startServer('vite dev', [
    'dev',
    '--config',
    'vite.config.mts',
    '--force',
    '--port',
    String(DEV_PORT),
    '--strictPort',
  ])
  await waitForServer(`http://localhost:${DEV_PORT}/`, dev)
  console.log('  [dev] running probes ...')
  modes.push(await runMode('dev', `http://localhost:${DEV_PORT}/gate?mode=dev`))
  killTree(dev.child)

  // ── production build + preview ─────────────────────────────────────────
  console.log('  [preview] building ...')
  const firstBuild = tryBuild()
  const buildProbe = firstBuild.ok
    ? { id: 'build:production', status: 'pass', code: 'ok', detail: 'vite build succeeded' }
    : {
        id: 'build:production',
        status: 'fail',
        code: 'build-failed',
        detail: summariseBuildFailure(firstBuild.output),
      }

  let previewBuild = firstBuild
  const excluded = new Set()

  // Preserve the full-consumer failure as evidence, then isolate every
  // attributable offender at build time. The skipped import stays external in
  // the second bundle and probes.ts refuses to execute it, so the remaining
  // packages get genuine Rollup + preview coverage without pretending the
  // missing peer was fixed.
  while (!previewBuild.ok) {
    const newlyAttributed = offendingPackages(previewBuild.output).filter(
      (name) => !excluded.has(name),
    )
    if (newlyAttributed.length === 0) break
    for (const name of newlyAttributed) excluded.add(name)
    previewBuild = tryBuild([...excluded])
  }

  if (!previewBuild.ok) {
    const blocked = offendingPackages(previewBuild.output)
    console.log(
      `  [preview] build failed (${blocked.join(', ') || 'cause not attributable'}) — preview leg blocked`,
    )
    modes.push({
      mode: 'preview',
      userAgent: 'n/a',
      results: [
        buildProbe,
        {
          id: 'preview:probes',
          status: 'fail',
          code: 'blocked-by-build-failure',
          detail: `production probes cannot run after isolating ${[...excluded].join(', ') || 'no attributable package'}: ${summariseBuildFailure(previewBuild.output)}`,
        },
      ],
    })
    await finish(modes, expectations)
    return
  }

  if (excluded.size > 0) {
    console.log(
      `  [preview] isolated build succeeded — excluded ${[...excluded].join(', ')}`,
    )
  }

  console.log('  [preview] starting preview server ...')
  const prev = startServer('vite preview', [
    'preview',
    '--config',
    'vite.config.mts',
    '--port',
    String(PREVIEW_PORT),
    '--strictPort',
  ])
  await waitForServer(`http://localhost:${PREVIEW_PORT}/`, prev)
  console.log('  [preview] running probes ...')
  const previewReport = await runMode('preview', `http://localhost:${PREVIEW_PORT}/gate?mode=preview`)
  previewReport.results.unshift(buildProbe)
  if (excluded.size > 0) {
    previewReport.results.splice(1, 0, {
      id: 'build:production-supported-packages',
      status: 'pass',
      code: 'ok',
      detail: `vite build succeeded after excluding ${[...excluded].join(', ')}`,
    })
  }
  modes.push(previewReport)
  killTree(prev.child)

  await teardown()
  await finish(modes, expectations)
}

// ── Build helpers ────────────────────────────────────────────────────────

function tryBuild(skip = []) {
  try {
    // Root `build` is the SDK build in connect-suite; the consumer build is vite build.
    execFileSync(process.execPath, [VITE_BIN, 'build', '--config', 'vite.config.mts'], {
      cwd: APP_DIR,
      shell: isWindows,
      stdio: 'pipe',
      env: { ...process.env, VITE_GATE_SKIP: skip.join(',') },
    })
    return { ok: true, output: '' }
  } catch (err) {
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    return { ok: false, output }
  }
}

/**
 * Attribute a build failure to the @naculus package that caused it.
 *
 * Two diagnostic shapes, because B9 changed which one the bundler emits. While
 * wagmi was an optional peer it was replaced by a stub and the failure came out
 * as MISSING_EXPORT naming `__vite-optional-peer-dep:wagmi:@naculus/connector-wagmi`.
 * With wagmi required there is no stub, so it is a plain unresolved import and
 * the package appears only in the importing file's path — which Rolldown puts on
 * the line *after* the message, so a single-line scan finds nothing and the
 * runner reports "cause not attributable".
 */
function offendingPackages(output) {
  const names = new Set()

  const collect = (text) => {
    for (const m of text.matchAll(/@naculus\/[a-z0-9-]+/g)) {
      if (GATE_PACKAGES.has(m[0])) names.add(m[0])
    }
  }

  const lines = output.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/MISSING_EXPORT|Missing export in/.test(lines[i])) collect(lines[i])
    if (/failed to resolve import|Could not resolve/i.test(lines[i])) {
      collect(`${lines[i]} ${lines[i + 1] ?? ''}`)
    }
  }

  return [...names]
}

/**
 * Reduce a failed build's output to the few lines that identify the cause.
 *
 * Tiers matter more than they look. "externalized for browser compatibility"
 * fires for every Node builtin any dependency touches and there are always
 * several; ranked alongside the real error they crowded it out entirely, and
 * the stored report ended up saying only "error during build" with no
 * attribution. The specific-cause tier therefore has to win outright rather
 * than merely sort first.
 */
function summariseBuildFailure(output) {
  const TIERS = [
    /failed to resolve import|Could not resolve|MISSING_EXPORT/i,
    /^Error: \[vite\]|Build failed with|error during build/,
    /doesn't exist at build time/,
    /externalized for browser/,
  ]

  const lines = output
    .split(/\r?\n/)
    .map((l) => l.replace(ANSI, '').trim())
    .filter(Boolean)

  const picked = []
  for (const tier of TIERS) {
    for (let i = 0; i < lines.length; i++) {
      if (!tier.test(lines[i])) continue
      // Rolldown wraps: the message ends with `from` and the importing path
      // follows on the next line. That path is the only thing naming the
      // package at fault, so keep it attached.
      const chunk = [lines[i], lines[i + 1]].filter(Boolean).join(' ')
      if (!picked.includes(chunk)) picked.push(chunk)
    }
    if (picked.length >= 3) break
  }

  return picked.slice(0, 3).join(' | ') || 'vite build failed (see .results/gate2.json)'
}

// ── Reporting ────────────────────────────────────────────────────────────

async function finish(modes, expectations) {

  // ── Report ─────────────────────────────────────────────────────────────
  let unexpected = 0
  const summary = []

  for (const report of modes) {
    const rows = classifyAgainstExpectations(report, expectations)
    summary.push({ mode: report.mode, rows, userAgent: report.userAgent })

    console.log(`\n── ${report.mode} ${'─'.repeat(58 - report.mode.length)}`)
    for (const row of rows) {
      if (row.verdict === 'PASS') continue
      const tag = row.verdict.padEnd(5)
      const finding = row.finding ? ` (${row.finding})` : ''
      console.log(`  ${tag} ${row.id}${finding}`)
      console.log(`        ${row.code}: ${row.detail.slice(0, 140)}`)
      if (row.note) console.log(`        ! ${row.note}`)
    }
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {})
    console.log(
      `  → ${counts.PASS ?? 0} pass · ${counts.KNOWN ?? 0} known · ` +
        `${counts.FIXED ?? 0} fixed · ${counts.FAIL ?? 0} fail`,
    )
    unexpected += counts.FAIL ?? 0
  }

  // dev and preview disagreeing is itself a finding worth surfacing.
  let drift = []
  if (summary.length === 2) {
    const [devRows, prevRows] = summary.map((s) => new Map(s.rows.map((r) => [r.id, r.code])))
    drift = [...devRows.entries()]
      .filter(([id, code]) => prevRows.has(id) && prevRows.get(id) !== code)
      .map(([id, code]) => ({ id, dev: code, preview: prevRows.get(id) }))
    if (drift.length) {
      console.log('\n  dev/preview drift:')
      for (const d of drift) console.log(`    ${d.id}: dev=${d.dev} preview=${d.preview}`)
    }
  }

  const outPath = join(resultsDir, 'gate2.json')
  writeFileSync(outPath, `${JSON.stringify({ summary, drift }, null, 2)}\n`)
  console.log(`\n  report written to ${outPath}`)

  console.log(`\n${'─'.repeat(72)}`)
  if (unexpected) {
    console.log(`  ${unexpected} unexpected failure(s) — gate FAILED\n`)
    process.exit(1)
  }
  console.log('  no unexpected failures\n')
}

main()
  .catch(async (err) => {
    console.error('\n  gate2 error:', err.message)
    await teardown()
    process.exit(1)
  })
  .finally(teardown)
