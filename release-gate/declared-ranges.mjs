#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readManifest, readTarball } from './lib/tar.mjs'

const testerRoot = import.meta.dirname
const defaultArtifactDir = join(testerRoot, 'artifacts')
const requireFromPnpm = createRequire(
  join(testerRoot, 'node_modules', '.pnpm', 'node_modules', 'semver', 'package.json'),
)
const { satisfies } = requireFromPnpm('semver')
const dependencyFields = ['dependencies', 'peerDependencies', 'optionalDependencies']

function fail(message) {
  throw new Error(`[declared-ranges] ${message}`)
}

export function validateDeclaredRanges(artifacts) {
  const versions = new Map(artifacts.map(({ manifest }) => [manifest.name, manifest.version]))
  const appkit = artifacts.filter(({ manifest }) =>
    manifest.name === '@naculus/connect-native' || manifest.name.startsWith('@naculus/connect-appkit-'))

  if (appkit.length === 0) fail('no packed connect-appkit tarballs found')

  for (const { manifest, filename } of appkit) {
    for (const field of dependencyFields) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith('@naculus/')) continue
        const version = versions.get(name)
        if (!version) fail(`${filename}: ${field}.${name}=${range} has no packed tarball`)
        if (!satisfies(version, range, { includePrerelease: true })) {
          fail(`${filename}: ${field}.${name}=${range} does not accept packed ${version}`)
        }
      }
    }
  }
}

export function validateInstalledLock(lock, expectedTarballs) {
  if (!lock || typeof lock !== 'object' || !lock.packages || typeof lock.packages !== 'object') {
    fail('package-lock.json has no packages object')
  }

  const installed = new Map()
  for (const [location, entry] of Object.entries(lock.packages)) {
    const match = location.match(/(?:^|\/)node_modules\/(\@naculus\/[^/]+)$/)
    if (!match) continue
    const name = match[1]
    if (!entry || typeof entry !== 'object' || typeof entry.resolved !== 'string') {
      fail(`${location} has no resolved tarball provenance`)
    }
    if (!entry.resolved.startsWith('file:') || !entry.resolved.endsWith('.tgz')) {
      fail(`${location} resolved outside local tarballs: ${entry.resolved}`)
    }
    const expected = expectedTarballs.get(name)
    if (!expected) fail(`${location} is an unexpected @naculus package`)
    if (basename(entry.resolved) !== expected) {
      fail(`${location} resolved ${entry.resolved}, expected ${expected}`)
    }
    installed.set(name, [...(installed.get(name) ?? []), location])
  }

  for (const [name] of expectedTarballs) {
    const locations = installed.get(name) ?? []
    if (locations.length !== 1) {
      fail(`${name} must exist exactly once; found ${locations.length}${locations.length ? ` at ${locations.join(', ')}` : ''}`)
    }
  }
}

function loadArtifacts(artifactDir) {
  const filenames = readdirSync(artifactDir).filter((name) => name.endsWith('.tgz')).sort()
  if (filenames.length === 0) fail(`no tarballs found in ${artifactDir}`)
  return filenames.map((filename) => ({
    filename,
    path: join(artifactDir, filename),
    manifest: readManifest(readTarball(join(artifactDir, filename))),
  }))
}

function installWithoutOverrides(artifacts) {
  const tempDir = mkdtempSync(join(tmpdir(), 'naculus-declared-ranges-'))
  try {
    const dependencies = Object.fromEntries(
      artifacts.map(({ manifest, path }) => [manifest.name, pathToFileURL(path).href]),
    )
    writeFileSync(join(tempDir, 'package.json'), `${JSON.stringify({ private: true, dependencies }, null, 2)}\n`)
    execFileSync('npm', ['install', '--ignore-scripts'], {
      cwd: tempDir,
      stdio: 'inherit',
      env: { ...process.env, npm_config_package_lock: 'true' },
    })

    let lock
    try {
      lock = JSON.parse(readFileSync(join(tempDir, 'package-lock.json'), 'utf8'))
    } catch (error) {
      fail(`missing or invalid package-lock.json: ${error.message}`)
    }
    validateInstalledLock(lock, new Map(artifacts.map(({ manifest, filename }) => [manifest.name, filename])))
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function main() {
  const artifactArg = process.argv.find((arg) => arg.startsWith('--artifact-dir='))
  const artifactDir = resolve(artifactArg?.slice('--artifact-dir='.length) ?? defaultArtifactDir)
  const artifacts = loadArtifacts(artifactDir)
  validateDeclaredRanges(artifacts)
  console.log(`  declared ranges accept all ${artifacts.length} packed @naculus packages`)
  installWithoutOverrides(artifacts)
  console.log('  plain npm install resolved every @naculus package exactly once from local tarballs')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
