#!/usr/bin/env node
/**
 * Release Gate 3 — deterministic end-to-end connector flows.
 *
 * Gate 2 proves that every package can be imported. Gate 3 drives the public
 * React provider through a real browser page with a local EIP-1193 wallet:
 * connect, external account/chain events, chain switch, accepted signing,
 * propagated RPC failure, and disconnect. No wallet extension, network, or
 * secret is used.
 */

import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const here = import.meta.dirname
const resultsDir = join(here, '.results')
const viteBin = join(here, 'node_modules', 'vite', 'bin', 'vite.js')
const viteConfig = join(here, 'vite.gate3.config.mjs')
const isWindows = process.platform === 'win32'
const DEV_PORT = 3278
const PREVIEW_PORT = 4278
const children = new Set()
let browser
let tornDown = false

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (isWindows) execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
  }
}

async function teardown() {
  if (tornDown) return
  tornDown = true
  if (browser) await browser.close().catch(() => {})
  for (const child of children) killTree(child)
  children.clear()
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => teardown().finally(() => process.exit(130)))
}
process.on('exit', () => { for (const child of children) killTree(child) })

function startServer(label, args) {
  const child = spawn(process.execPath, [viteBin, ...args], {
    cwd: here,
    detached: !isWindows,
    env: { ...process.env, CI: 'true', npm_config_confirm_modules_purge: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = []
  child.stdout.on('data', (data) => log.push(data.toString()))
  child.stderr.on('data', (data) => log.push(data.toString()))
  child.on('exit', () => children.delete(child))
  children.add(child)
  return { label, child, log }
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`${server.label} exited early:\n${server.log.join('')}`)
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${server.label} did not become ready:\n${server.log.join('')}`)
}

async function runBrowserFlow(label, url) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForSelector('[data-gate3-state="done"], [data-gate3-state="error"]', { timeout: 180_000 })
  const report = await page.evaluate(() => window.__GATE3_RESULT__ ?? null)
  const fatal = await page.evaluate(() => window.__GATE3_ERROR__ ?? null)
  await context.close()

  if (!report) throw new Error(`${label}: flow did not produce a report (${fatal ?? 'unknown error'})`)
  if (pageErrors.length) throw new Error(`${label}: browser page error(s): ${pageErrors.join(' | ')}`)
  return { mode: label, ...report, consoleErrors }
}

async function main() {
  mkdirSync(resultsDir, { recursive: true })
  for (const packageName of ['@naculus/connect-appkit-react', '@naculus/connector-evm-injected']) {
    try { readFileSync(join(here, 'node_modules', ...packageName.split('/'), 'package.json')) }
    catch { throw new Error(`${packageName} is not installed. Run pnpm gate:pack && pnpm gate:install first.`) }
  }

  const { chromium } = await import('@playwright/test')
  browser = await chromium.launch()
  const reports = []

  const dev = startServer('vite dev', ['dev', '--config', viteConfig, '--force', '--port', String(DEV_PORT), '--strictPort'])
  await waitForServer(`http://localhost:${DEV_PORT}/gate3.html`, dev)
  reports.push(await runBrowserFlow('dev', `http://localhost:${DEV_PORT}/gate3.html`))
  killTree(dev.child)

  try {
    execFileSync(process.execPath, [viteBin, 'build', '--config', viteConfig], {
      cwd: here,
      stdio: 'pipe',
      env: { ...process.env, CI: 'true' },
    })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    throw new Error(`production build failed:\n${output.slice(-8_000)}`)
  }

  const preview = startServer('vite preview', ['preview', '--config', viteConfig, '--port', String(PREVIEW_PORT), '--strictPort'])
  await waitForServer(`http://localhost:${PREVIEW_PORT}/gate3.html`, preview)
  reports.push(await runBrowserFlow('preview', `http://localhost:${PREVIEW_PORT}/gate3.html`))
  killTree(preview.child)

  const failures = reports.flatMap((report) => report.results.filter((result) => result.status === 'fail').map((result) => `${report.mode}:${result.id}`))
  const output = { reports, failures }
  const outPath = join(resultsDir, 'gate3.json')
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`\nRelease Gate 3 — ${reports.length} modes, ${failures.length} failure(s)`)
  console.log(`  report written to ${outPath}`)
  if (failures.length) {
    for (const failure of failures) console.log(`  FAIL ${failure}`)
    process.exitCode = 1
  } else {
    console.log('  all connector flows passed')
  }
}

main().catch(async (error) => {
  console.error(`\nGate 3 failed: ${error.message}`)
  await teardown()
  process.exitCode = 1
}).finally(teardown)
