#!/usr/bin/env node
// Wires the wagmi consumer fixture to either:
//   default      local packed tarballs in tester/artifacts (pre-publish gate)
//   --registry   the versions published on npm (post-publish gate)
// Both modes write the same dependency AND pnpm override, so the fixture can
// never silently resolve a different copy than the one it claims to test.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { artifactFilename, readArtifactManifests } from './lib/package-set.mjs'

const registryMode = process.argv.includes('--registry')
const releaseGateRoot = import.meta.dirname
const testerRoot = join(releaseGateRoot, 'tester')
const artifactDir = join(testerRoot, 'artifacts')
const fixtureRoot = join(testerRoot, 'fixtures', 'wagmi-consumer')
const packagePath = join(fixtureRoot, 'package.json')
const workspacePath = join(fixtureRoot, 'pnpm-workspace.yaml')
const libPackagesDir = join(releaseGateRoot, '..', 'packages', 'lib', 'packages')
const required = [
  '@naculus/connect-core',
  '@naculus/connector-walletconnect',
  '@naculus/connector-wagmi',
]

// Source-of-truth versions for registry mode: the lib workspace packages.
function libVersionsByName() {
  const versions = new Map()
  for (const dir of readdirSync(libPackagesDir)) {
    const file = join(libPackagesDir, dir, 'package.json')
    if (!existsSync(file)) continue
    const { name, version } = JSON.parse(readFileSync(file, 'utf8'))
    if (name && version) versions.set(name, version)
  }
  return versions
}

const specs = new Map()
if (registryMode) {
  const versions = libVersionsByName()
  for (const name of required) {
    const version = versions.get(name)
    if (!version) throw new Error(`no lib package.json version for ${name}`)
    specs.set(name, version)
  }
} else {
  const { artifacts, unreadable } = readArtifactManifests(artifactDir)
  if (unreadable.length) throw new Error(unreadable.join('\n'))
  const artifactByName = new Map(artifacts.map(({ manifest, file }) => [manifest.name, { manifest, file }]))
  for (const name of required) {
    const artifact = artifactByName.get(name)
    if (!artifact) throw new Error(`missing local artifact for ${name}`)
    specs.set(name, `file:../../artifacts/${artifactFilename(name, artifact.manifest.version)}`)
  }
}

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
packageJson.dependencies = {
  ...packageJson.dependencies,
  ...Object.fromEntries(specs),
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

let workspace = readFileSync(workspacePath, 'utf8')
for (const [name, spec] of specs) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const line = new RegExp(`^(\\s*['\"]?${escaped}['\"]?:\\s*).*$`, 'm')
  if (!line.test(workspace)) {
    throw new Error(`missing override for ${name} in ${workspacePath}`)
  }
  workspace = workspace.replace(line, `$1'${spec}'`)
}
writeFileSync(workspacePath, workspace)

const mode = registryMode ? 'npm registry' : 'local artifacts'
console.log(`wired wagmi fixture to ${mode} (${[...specs.values()].join(', ')})`)
