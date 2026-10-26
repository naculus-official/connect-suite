#!/usr/bin/env node
/**
 * pnpm-lifecycle-safe launcher for version transitions.
 *
 * Validation and all writes belong to install-artifacts.mjs.
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const here = import.meta.dirname
const installer = join(import.meta.dirname, 'install-artifacts.mjs')

const result = spawnSync(process.execPath, [installer, ...process.argv.slice(2)], {
  cwd: here,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`failed to start installer: ${result.error.message}`)
  process.exit(1)
}

if (result.signal) {
  console.error(`installer terminated by ${result.signal}`)
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

process.exit(0)
