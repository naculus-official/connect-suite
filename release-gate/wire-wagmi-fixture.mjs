#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { artifactFilename, readArtifactManifests } from './lib/package-set.mjs'

const testerRoot = import.meta.dirname
const artifactDir = join(testerRoot, 'artifacts')
const fixtureRoot = join(testerRoot, 'fixtures', 'wagmi-consumer')
const packagePath = join(fixtureRoot, 'package.json')
const workspacePath = join(fixtureRoot, 'pnpm-workspace.yaml')
const required = [
  '@naculus/connect-core',
  '@naculus/connector-walletconnect',
  '@naculus/connector-wagmi',
]

const { artifacts, unreadable } = readArtifactManifests(artifactDir)
if (unreadable.length) throw new Error(unreadable.join('\n'))

const artifactByName = new Map(artifacts.map(({ manifest, file }) => [manifest.name, { manifest, file }]))
const specs = new Map()
for (const name of required) {
  const artifact = artifactByName.get(name)
  if (!artifact) throw new Error(`missing local artifact for ${name}`)
  specs.set(name, `file:../../artifacts/${artifactFilename(name, artifact.manifest.version)}`)
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

console.log(`wired wagmi fixture to local artifacts (${[...specs.values()].join(', ')})`)
