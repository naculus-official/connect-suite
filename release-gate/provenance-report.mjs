#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getInstallSpecMap } from './lib/sdk-resolution.mjs'

const root = resolve(import.meta.dirname, '..')
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='))
const profile = profileArg?.slice('--profile='.length)

function main() {
  if (!profile) throw new Error('usage: node release-gate/provenance-report.mjs --profile=npm|prebuilt')
  const specs = getInstallSpecMap(profile)
  let mismatch = false
  for (const [name, spec] of Object.entries(specs).sort(([a], [b]) => a.localeCompare(b))) {
    const packagePath = join(root, 'node_modules', ...name.split('/'), 'package.json')
    if (!existsSync(packagePath)) {
      console.log(`${name}\tMISSING\t-\tMISMATCH`)
      mismatch = true
      continue
    }
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
    const realpath = realpathSync(packagePath)
    const expectedVersion = spec.startsWith('./artifacts/')
      ? spec.match(/-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.tgz$/)?.[1]
      : spec
    const versionMatches = manifest.version === expectedVersion
    const artifactFilename = spec.startsWith('./artifacts/') ? spec.split('/').at(-1) : null
    // pnpm encodes path separators and @ as + in file: install directory names; package-name hyphens stay unchanged.
    const locationMatches = artifactFilename
      ? realpath.includes(`file+artifacts+${artifactFilename}`)
      : !realpath.includes('/artifacts/')
    const matches = versionMatches && locationMatches
    if (!matches) mismatch = true
    console.log(`${name}\t${manifest.version}\t${realpath}\t${matches ? 'MATCH' : 'MISMATCH'}`)
  }
  if (mismatch) process.exitCode = 1
}

try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
