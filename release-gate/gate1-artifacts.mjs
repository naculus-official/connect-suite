#!/usr/bin/env node
/**
 * Release Gate 1 — published-artifact checks.
 *
 * Runs against `pnpm pack` tarballs, never against workspace sources. Every
 * defect this catches is invisible to `vitest` in the SDK repos, because those
 * suites resolve `@naculus/*` through `resolve.alias` back to `src/`.
 *
 *   node release-gate/gate1-artifacts.mjs [artifactDir]
 *
 * Exit code 0 = all checks passed, 1 = at least one FAIL.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { readTarball, readManifest, collectExportTargets } from './lib/tar.mjs'
import {
  WORKSPACE_FINGERPRINTS,
  VENDORED_FINGERPRINTS,
  BROWSER_UNSAFE_GLOBALS,
  FRAMEWORK_COUPLED,
  PUBLISH_LEAK_PATTERNS,
  WORKER_URL,
  browserUnresolvableSpecifiers,
  workerNodeGlobals,
} from './lib/fingerprints.mjs'

const artifactDir = resolve(process.argv[2] ?? 'artifacts')

const results = []
const record = (pkg, check, status, detail) =>
  results.push({ pkg, check, status, detail })

const isJs = (path) => /\.(m|c)?js$/.test(path)
const textOf = (entries, path) => entries.get(path)?.toString('utf8') ?? ''

function declaredDeps(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])
}

// ── Individual checks ────────────────────────────────────────────────────

/** Every path a consumer can be routed to must actually be in the tarball. */
function checkEntryPointsResolve(pkg, manifest, entries) {
  const targets = new Set(
    [manifest.main, manifest.module, manifest.types, manifest.typings]
      .concat(collectExportTargets(manifest.exports))
      .filter((t) => typeof t === 'string' && t.startsWith('.')),
  )

  const missing = [...targets].filter((t) => {
    const normalised = t.replace(/^\.\//, '')
    if (normalised.includes('*')) return false // wildcard subpaths: not resolvable statically
    return !entries.has(normalised)
  })

  if (missing.length) {
    record(pkg, 'entry-points-resolve', 'FAIL', `missing from tarball: ${missing.join(', ')}`)
  } else {
    record(pkg, 'entry-points-resolve', 'PASS', `${targets.size} target(s) present`)
  }
}

/** A CJS build nobody can reach is dead weight, and breaks Node < 22.12 consumers. */
function checkCjsReachable(pkg, manifest, entries) {
  const cjsFiles = [...entries.keys()].filter((p) => p.endsWith('.cjs'))
  if (!cjsFiles.length) {
    record(pkg, 'cjs-reachable', 'SKIP', 'no CJS output')
    return
  }
  const exported = collectExportTargets(manifest.exports).join(' ')
  const hasRequireCondition = JSON.stringify(manifest.exports ?? {}).includes('"require"')

  if (!hasRequireCondition || !exported.includes('.cjs')) {
    record(
      pkg,
      'cjs-reachable',
      'FAIL',
      `${cjsFiles.length} .cjs file(s) shipped but no "require" condition routes to them`,
    )
  } else {
    record(pkg, 'cjs-reachable', 'PASS', 'require condition present')
  }
}

/**
 * Node-only globals left in ESM output (finding B2).
 *
 * Reported as a warning, not a failure. Gate 2 proved that Vite + TanStack
 * Start shim `process` well enough for these imports to succeed, so calling it
 * a hard break would overstate the evidence. What remains true is that the
 * artifact cannot stand on its own: a bare `<script type="module">`, a Worker,
 * or a bundler without a `process` shim has nothing to fall back on. Treat this
 * as a portability finding until one of those environments is actually tested.
 */
function checkBrowserSafe(pkg, manifest, entries) {
  const hits = []
  for (const [path, buf] of entries) {
    if (!isJs(path)) continue
    if (path.endsWith('.cjs')) continue // CJS build is legitimately Node-flavoured
    const text = buf.toString('utf8')
    for (const { pattern, name } of BROWSER_UNSAFE_GLOBALS) {
      const found = text.match(pattern)
      if (found) hits.push(`${path}: ${name} x${found.length} (${[...new Set(found)].slice(0, 4).join(', ')})`)
    }
  }
  if (hits.length) {
    record(pkg, 'browser-safe', 'WARN', `portability: ${hits.join(' | ')}`)
  } else {
    record(pkg, 'browser-safe', 'PASS', 'no Node-only globals in ESM output')
  }
}

/** A browser entry must not rely on Node builtins that bundlers replace with empty shims. */
function checkBrowserEntryNodeBuiltins(pkg, manifest, entries) {
  const exportRoot = manifest.exports?.['.']
  const candidates = [
    typeof manifest.browser === 'string' ? manifest.browser : null,
    manifest.module,
    typeof exportRoot === 'object' ? exportRoot.browser : null,
    typeof exportRoot === 'object' ? exportRoot.import : null,
    typeof manifest.exports === 'string' ? manifest.exports : null,
  ]
    .filter((path) => typeof path === 'string')
    .map((path) => path.replace(/^\.\//, ''))
  const nodeBuiltinImport =
    /(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'](?:node:)?(?:crypto|fs|path|os|worker_threads)["']/g
  const offenders = []

  for (const path of new Set(candidates)) {
    const body = textOf(entries, path)
    const found = body.match(nodeBuiltinImport)
    if (found) offenders.push(`${path}: ${[...new Set(found)].join(', ')}`)
  }

  if (offenders.length) {
    record(
      pkg,
      'browser-entry-builtins',
      'FAIL',
      `Node builtin import(s) become empty browser shims — ${offenders.join(' | ')}`,
    )
  } else {
    record(pkg, 'browser-entry-builtins', 'PASS', 'browser entry imports no Node builtins')
  }
}

/** A workspace package inlined into a sibling duplicates its module state. */
function checkNoInlinedWorkspace(pkg, manifest, entries) {
  const deps = declaredDeps(manifest)
  const offenders = []

  for (const { owner, markers } of WORKSPACE_FINGERPRINTS) {
    if (pkg === owner) continue
    if (!deps.has(owner)) continue
    for (const [path, buf] of entries) {
      if (!isJs(path)) continue
      const text = buf.toString('utf8')
      if (markers.some((m) => text.includes(m))) {
        offenders.push(`${owner} inlined into ${path}`)
        break
      }
    }
  }

  if (offenders.length) {
    record(pkg, 'no-inlined-workspace', 'FAIL', offenders.join(' | '))
  } else {
    record(pkg, 'no-inlined-workspace', 'PASS', 'workspace deps stay external')
  }
}

/**
 * Vendored crypto can never be patched by a dependency bump or pnpm override.
 *
 * Declaring the library as a dependency does not clear this. A copy that is
 * both declared and bundled is exactly as unpatchable as an undeclared one —
 * the declaration only makes it harder to notice, because the manifest now
 * says the right thing while the bytes still say the wrong one. The
 * declaration is reported in the diagnostic, never used to skip the scan.
 */
function checkNoVendoredCrypto(pkg, manifest, entries) {
  const deps = declaredDeps(manifest)
  const offenders = []

  for (const { pkg: lib, markers } of VENDORED_FINGERPRINTS) {
    for (const [path, buf] of entries) {
      if (!isJs(path)) continue
      const text = buf.toString('utf8')
      if (markers.every((m) => text.includes(m))) {
        offenders.push(
          deps.has(lib)
            ? `${lib} inlined into ${path} — declared as a dependency, but the bundled copy is what runs`
            : `${lib} inlined into ${path} and not in dependencies`,
        )
        break
      }
    }
  }

  if (offenders.length) {
    record(pkg, 'no-vendored-crypto', 'FAIL', offenders.join(' | '))
  } else {
    record(pkg, 'no-vendored-crypto', 'PASS', 'no third-party crypto inlined')
  }
}

/** Framework-neutral packages must not drag a framework into the install tree. */
function checkFrameworkNeutral(pkg, manifest) {
  const neutral = /-wc$|-vue$|-loader$/.test(pkg) || pkg === '@naculus/connect-appkit-wc'
  if (!neutral) {
    record(pkg, 'framework-neutral', 'SKIP', 'not a framework-neutral package')
    return
  }
  const own = pkg.endsWith('-vue') ? ['vue', '@naculus/connect-appkit-vue'] : []
  const leaked = [...declaredDeps(manifest)].filter(
    (d) => FRAMEWORK_COUPLED.includes(d) && !own.includes(d),
  )
  if (leaked.length) {
    record(pkg, 'framework-neutral', 'FAIL', `pulls in ${leaked.join(', ')}`)
  } else {
    record(pkg, 'framework-neutral', 'PASS', 'no framework packages in dependency closure')
  }
}

/** Sources, tests and build configs do not belong in a published tarball. */
function checkNoPublishLeak(pkg, manifest, entries) {
  const leaked = [...entries.keys()].filter((p) =>
    PUBLISH_LEAK_PATTERNS.some((re) => re.test(p)),
  )
  if (leaked.length) {
    const sample = leaked.slice(0, 5).join(', ')
    const more = leaked.length > 5 ? ` (+${leaked.length - 5} more)` : ''
    record(pkg, 'no-publish-leak', 'FAIL', `${leaked.length} unpublishable file(s): ${sample}${more}`)
  } else {
    record(pkg, 'no-publish-leak', 'PASS', 'tarball contains build output only')
  }
}

/** The headline umbrella package must expose a usable public entry point. */
function checkUmbrellaNonEmpty(pkg, manifest, entries) {
  if (pkg !== '@naculus/connect') {
    record(pkg, 'umbrella-non-empty', 'SKIP', 'not the umbrella package')
    return
  }
  const main = (manifest.main ?? './index.js').replace(/^\.\//, '')
  const body = textOf(entries, main)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim()

  if (!body || body === 'export {};' || body === 'export{};') {
    record(pkg, 'umbrella-non-empty', 'FAIL', `${main} exports nothing (body: ${JSON.stringify(body)})`)
  } else {
    record(pkg, 'umbrella-non-empty', 'PASS', `${main} has real exports`)
  }
}

/** A Worker script referenced by `new URL(...)` must be emitted next to the code. */
function checkWorkerEmitted(pkg, manifest, entries) {
  const referenced = new Set()
  for (const [path, buf] of entries) {
    if (!isJs(path)) continue
    for (const m of buf.toString('utf8').matchAll(/new URL\(\s*["'](\.\/[^"']+\.js)["']/g)) {
      referenced.add(m[1].replace(/^\.\//, ''))
    }
  }
  if (!referenced.size) {
    record(pkg, 'worker-emitted', 'SKIP', 'no new URL() worker references')
    return
  }
  const missing = [...referenced].filter((rel) => ![...entries.keys()].some((p) => p.endsWith(rel)))
  if (missing.length) {
    record(pkg, 'worker-emitted', 'FAIL', `referenced but not emitted: ${missing.join(', ')}`)
  } else {
    record(pkg, 'worker-emitted', 'PASS', `${referenced.size} worker asset(s) present`)
  }
}

/**
 * A Worker asset must only import things a browser worker can resolve.
 *
 * `new Worker(url, { type: "module" })` gets no bundler and no import map, so a
 * bare package specifier left in the emitted file is unresolvable at runtime.
 * Emitting the file without bundling its dependencies turns a 404 into a module
 * resolution error — a different symptom for the same broken feature — so
 * checking that the file exists is not enough on its own.
 *
 * This does not demand zero imports. Relative chunk imports are a legitimate
 * way to split a worker; only specifiers needing a resolver are rejected.
 *
 * Caught a real defect on its first run: the worker bundle contained
 * `import ... from "crypto"`, because tsup defaults to platform "node" and
 * picked the Node condition of @noble/hashes' crypto export.
 */
function checkWorkerBrowserResolvable(pkg, manifest, entries) {
  const referenced = new Set()
  for (const [path, buf] of entries) {
    if (!isJs(path)) continue
    for (const m of buf.toString('utf8').matchAll(WORKER_URL)) {
      referenced.add(m[1].replace(/^\.\//, ''))
    }
  }
  if (!referenced.size) {
    record(pkg, 'worker-browser-resolvable', 'SKIP', 'no worker assets')
    return
  }

  const offenders = []
  for (const rel of referenced) {
    const entry = [...entries].find(([p]) => p.endsWith(rel))
    if (!entry) continue // absence is worker-emitted's finding to report
    const bad = browserUnresolvableSpecifiers(entry[1].toString('utf8'))
    if (bad.length) offenders.push(`${rel}: ${bad.join(', ')}`)
  }

  if (offenders.length) {
    record(
      pkg,
      'worker-browser-resolvable',
      'FAIL',
      `specifier(s) a browser worker cannot resolve — ${offenders.join(' | ')}`,
    )
  } else {
    record(
      pkg,
      'worker-browser-resolvable',
      'PASS',
      `${referenced.size} worker asset(s) import nothing a worker cannot resolve`,
    )
  }
}

/**
 * A Worker asset must not reach for Node-only globals.
 *
 * `browser-safe` above flags the same patterns across the whole tarball but
 * only warns, because a consumer's bundler normally shims `process` — Gate 2
 * confirmed Vite does. A module worker is loaded straight from a URL by
 * `new Worker()`, outside any bundler, so nothing shims it there. Same pattern,
 * different consequence, so it fails here instead of warning.
 *
 * Scoped to worker assets on purpose: applying this severity to dist/index.js
 * would fail packages whose main bundle is legitimately relying on a shim.
 */
function checkWorkerNoNodeGlobals(pkg, manifest, entries) {
  const referenced = new Set()
  for (const [path, buf] of entries) {
    if (!isJs(path)) continue
    for (const m of buf.toString('utf8').matchAll(WORKER_URL)) {
      referenced.add(m[1].replace(/^\.\//, ''))
    }
  }
  if (!referenced.size) {
    record(pkg, 'worker-no-node-globals', 'SKIP', 'no worker assets')
    return
  }

  const offenders = []
  for (const rel of referenced) {
    const entry = [...entries].find(([p]) => p.endsWith(rel))
    if (!entry) continue // absence is worker-emitted's finding to report
    const hits = workerNodeGlobals(entry[1].toString('utf8'))
    if (hits.length) offenders.push(`${rel}: ${hits.join(', ')}`)
  }

  if (offenders.length) {
    record(
      pkg,
      'worker-no-node-globals',
      'FAIL',
      `Node-only global(s) with nothing to shim them — ${offenders.join(' | ')}`,
    )
  } else {
    record(
      pkg,
      'worker-no-node-globals',
      'PASS',
      `${referenced.size} worker asset(s) free of Node-only globals`,
    )
  }
}

/** Sourcemaps that inline full sources can dwarf the code they describe. */
function checkSourcemapWeight(pkg, manifest, entries) {
  let code = 0
  let maps = 0
  for (const [path, buf] of entries) {
    if (path.endsWith('.map')) maps += buf.length
    else if (isJs(path)) code += buf.length
  }
  if (!maps) {
    record(pkg, 'sourcemap-weight', 'SKIP', 'no sourcemaps')
    return
  }
  const ratio = maps / Math.max(code, 1)
  const detail = `code ${(code / 1024).toFixed(0)}KB, maps ${(maps / 1024).toFixed(0)}KB (${ratio.toFixed(1)}x)`
  record(pkg, 'sourcemap-weight', ratio > 3 ? 'WARN' : 'PASS', detail)
}

// ── Runner ───────────────────────────────────────────────────────────────

const CHECKS = [
  checkEntryPointsResolve,
  checkCjsReachable,
  checkBrowserSafe,
  checkBrowserEntryNodeBuiltins,
  checkNoInlinedWorkspace,
  checkNoVendoredCrypto,
  checkFrameworkNeutral,
  checkNoPublishLeak,
  checkUmbrellaNonEmpty,
  checkWorkerEmitted,
  checkWorkerBrowserResolvable,
  checkWorkerNoNodeGlobals,
  checkSourcemapWeight,
]

function main() {
  let tarballs
  try {
    tarballs = readdirSync(artifactDir)
      .filter((f) => f.endsWith('.tgz'))
      .map((f) => join(artifactDir, f))
      .filter((f) => statSync(f).isFile())
  } catch {
    console.error(`\n  Artifact directory not found: ${artifactDir}`)
    console.error('  Run `pnpm gate:pack` first.\n')
    process.exit(1)
  }

  if (!tarballs.length) {
    console.error(`\n  No .tgz files in ${artifactDir}. Run \`pnpm gate:pack\` first.\n`)
    process.exit(1)
  }

  console.log(`\nRelease Gate 1 — ${tarballs.length} artifact(s) from ${artifactDir}\n`)

  for (const tgz of tarballs) {
    let entries
    let manifest
    try {
      entries = readTarball(tgz)
      manifest = readManifest(entries)
    } catch (err) {
      record(basename(tgz), 'readable', 'FAIL', String(err.message))
      continue
    }
    for (const check of CHECKS) {
      try {
        check(manifest.name, manifest, entries)
      } catch (err) {
        record(manifest.name, check.name, 'FAIL', `check threw: ${err.message}`)
      }
    }
  }

  const icon = { PASS: '  ok  ', FAIL: ' FAIL ', WARN: ' warn ', SKIP: '  --  ' }
  let currentPkg = null
  for (const r of results) {
    if (r.pkg !== currentPkg) {
      currentPkg = r.pkg
      console.log(`\n${currentPkg}`)
    }
    if (r.status === 'SKIP') continue
    console.log(`  [${icon[r.status]}] ${r.check.padEnd(22)} ${r.detail}`)
  }

  const failures = results.filter((r) => r.status === 'FAIL')
  const warnings = results.filter((r) => r.status === 'WARN')

  console.log(`\n${'─'.repeat(72)}`)
  console.log(
    `  ${results.filter((r) => r.status === 'PASS').length} passed · ` +
      `${warnings.length} warning · ${failures.length} failed\n`,
  )

  if (failures.length) {
    console.log('  Blocking failures:')
    for (const f of failures) console.log(`    ${f.pkg} → ${f.check}`)
    console.log('')
    process.exit(1)
  }
}

main()
