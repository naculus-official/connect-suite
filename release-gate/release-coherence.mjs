#!/usr/bin/env node
/**
 * Release coherence — does the version agree everywhere it is written down?
 *
 *   node release-gate/release-coherence.mjs
 *
 * The version of an SDK package is recorded in five places along the path from
 * source to this consumer:
 *
 *   packages/<x>/package.json "version"
 *     -> the manifest inside the packed tarball
 *       -> the tarball's filename
 *         -> tester package.json  "file:./artifacts/<name>-<version>.tgz"
 *           -> tester pnpm-workspace.yaml overrides
 *             -> tester pnpm-lock.yaml  integrity of those exact bytes
 *
 * Nothing checked that those five agree. They can disagree quietly: renaming a
 * tarball makes the override match while the manifest says something else, and
 * re-packing without re-running `gate:install` leaves the lockfile attesting to
 * bytes that are no longer on disk. Gate 1 and Gate 2 both look inside the
 * artifacts and would pass either way.
 *
 * Read-only by construction: no pack, no install, no writes. It reports what is
 * on disk. Fixing a mismatch is `pnpm gate:pack && pnpm gate:install`, never
 * this script.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  artifactFilename,
  assertExactPackageSet,
  discoverPublicPackagesFromRepos,
  readArtifactManifests,
  repoOfPackages,
} from './lib/package-set.mjs'
import { groupDir, sdkRootFromArgs } from './lib/sdk-layout.mjs'

const HERE = import.meta.dirname
const SDK_ROOT = sdkRootFromArgs(process.argv)
const artifactDirArg = process.argv.find((a) => a.startsWith('--artifact-dir='))
const ARTIFACT_DIR = resolve(artifactDirArg?.slice('--artifact-dir='.length) ?? join(HERE, 'artifacts'))
const SCOPE = '@naculus/'

const failures = []
let checkCount = 0

function report(label, problems, okDetail) {
  checkCount++
  if (problems.length === 0) {
    console.log(`  ${'ok'.padEnd(6)}${label.padEnd(26)}${okDetail}`)
    return
  }
  console.log(`  ${'FAIL'.padEnd(6)}${label.padEnd(26)}${problems.length} problem(s)`)
  for (const p of problems) console.log(`        ${p}`)
  failures.push(label)
}

// ── Inputs ───────────────────────────────────────────────────────────────

/**
 * Every artifact, with the manifest actually inside it.
 *
 * A truncated or corrupt tarball is reported, not thrown: it is one of the
 * states this script exists to name, and a stack trace names it badly.
 */
function readArtifacts() {
  if (!existsSync(ARTIFACT_DIR)) return { artifacts: [], unreadable: [] }
  return readArtifactManifests(ARTIFACT_DIR)
}

/**
 * The `overrides:` block of pnpm-workspace.yaml.
 *
 * Parsed with a regex rather than a YAML library for the same reason
 * install-artifacts.mjs writes it with one: this has to keep working when the
 * tester's own dependencies are broken, which is when it matters most.
 */
function readOverrides() {
  const text = readFileSync(join(HERE, 'pnpm-workspace.yaml'), 'utf8')
  const block = text.match(/^overrides:\r?\n((?:[ \t]+.*\r?\n?)*)/m)
  const out = new Map()
  if (!block) return out
  for (const line of block[1].split(/\r?\n/)) {
    const m = line.match(/^\s+'?([^':]+)'?:\s*'?([^'\s]+)'?\s*$/)
    if (m && m[1].startsWith(SCOPE)) out.set(m[1], m[2])
  }
  return out
}

function readTesterDeps() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))
  return new Map(
    Object.entries(manifest.dependencies ?? {}).filter(([k]) => k.startsWith(SCOPE)),
  )
}

/** Every `file:artifacts/...` resolution recorded in the lockfile. */
function readLockfileTarballs() {
  const text = readFileSync(join(HERE, 'pnpm-lock.yaml'), 'utf8')
  // pnpm emits inline resolution maps in some versions and block mappings in
  // others. Accept both forms so coherence checks remain useful after a
  // lockfile-only install or a pnpm upgrade.
  const re = /resolution:\s*(?:\{\s*integrity:\s*(sha512-[^,}\s]+),\s*tarball:\s*file:(artifacts\/[^,}\s]+)\s*\}|integrity:\s*(sha512-[^\s]+)\s+tarball:\s*file:(artifacts\/[^\s]+))/g
  const out = new Map()
  for (const m of text.matchAll(re)) {
    const integrity = m[1] ?? m[3]
    const file = m[2] ?? m[4]
    out.set(file.replace(/^artifacts\//, ''), integrity)
  }
  return out
}

/** pnpm records `sha512-<base64>` over the tarball bytes as shipped. */
function integrityOf(path) {
  return `sha512-${createHash('sha512').update(readFileSync(path)).digest('base64')}`
}

// ── Checks ───────────────────────────────────────────────────────────────

/** A renamed tarball is the cheapest way to fake version coherence. */
function checkFilenameMatchesManifest(artifacts) {
  const problems = []
  for (const { file, manifest } of artifacts) {
    const expected = artifactFilename(manifest.name, manifest.version)
    if (file !== expected) {
      problems.push(`${file} contains ${manifest.name}@${manifest.version}, which packs as ${expected}`)
    }
  }
  report('filename ↔ manifest', problems, `${artifacts.length}/${artifacts.length} agree`)
}

/** package.json, the overrides block and the artifacts on disk must name one file. */
function checkSpecifiersMatchArtifacts(artifacts, overrides, deps) {
  const problems = []
  const byName = new Map()
  for (const artifact of artifacts) {
    if (byName.has(artifact.manifest.name)) {
      problems.push(`duplicate artifact package: ${artifact.manifest.name}`)
      continue
    }
    byName.set(artifact.manifest.name, artifact)
  }
  try {
    const expected = new Set(
      discoverPublicPackagesFromRepos([
        groupDir(SDK_ROOT, 'connect-lib'),
        groupDir(SDK_ROOT, 'connect-appkit'),
      ]).map(({ manifest }) => manifest.name),
    )
    assertExactPackageSet(expected, byName.keys(), 'artifact package set')
  } catch (error) {
    problems.push(error.message)
  }

  for (const { file, manifest } of artifacts) {
    const want = `file:./artifacts/${file}`
    const override = overrides.get(manifest.name)
    const dep = deps.get(manifest.name)
    if (override === undefined) problems.push(`${manifest.name}: no pnpm-workspace.yaml override`)
    else if (override !== want) problems.push(`${manifest.name}: override is "${override}", artifact is "${want}"`)
    if (dep === undefined) problems.push(`${manifest.name}: not in tester package.json dependencies`)
    else if (dep !== want) problems.push(`${manifest.name}: package.json says "${dep}", artifact is "${want}"`)
  }

  for (const [name, spec] of overrides) {
    if (!byName.has(name)) problems.push(`override for ${name} → "${spec}" has no artifact`)
    else {
      const target = spec.replace(/^file:\.\//, '')
      if (!existsSync(join(HERE, target))) problems.push(`override for ${name} points at missing file ${target}`)
    }
  }

  report(
    'specifiers ↔ artifacts',
    problems,
    `${overrides.size} override(s), ${deps.size} dependency specifier(s), 0 dangling`,
  )
}

/**
 * Lockstep upstream means one version per SDK repo down here too. The two
 * repos release independently (connect-appkit 0.2.6 shipped on connect-lib
 * 0.2.5), so the check groups by repo rather than demanding one global version.
 */
function checkSingleVersionSet(artifacts) {
  const repoOf = repoOfPackages([
    groupDir(SDK_ROOT, 'connect-lib'),
    groupDir(SDK_ROOT, 'connect-appkit'),
  ])
  const byRepo = new Map()
  for (const { manifest } of artifacts) {
    const repo = repoOf.get(manifest.name) ?? 'unknown repo'
    const versions = byRepo.get(repo) ?? new Map()
    const list = versions.get(manifest.version) ?? []
    list.push(manifest.name)
    versions.set(manifest.version, list)
    byRepo.set(repo, versions)
  }
  const problems = []
  for (const [repo, versions] of byRepo) {
    if (versions.size <= 1) continue
    problems.push(`${repo} artifacts span more than one version; that repo releases in lockstep`)
    for (const [v, names] of [...versions].sort((a, b) => b[1].length - a[1].length)) {
      problems.push(`  ${v}: ${names.join(', ')}`)
    }
  }
  const summary = [...byRepo]
    .map(([repo, versions]) => `${repo} {${[...versions.keys()].join(', ')}}`)
    .join('; ')
  report('single version set', problems, summary)
}

/** A lockfile attesting to bytes that are no longer on disk is worse than none. */
function checkLockfileIntegrity(artifacts) {
  const recorded = readLockfileTarballs()
  const problems = []
  let matched = 0

  for (const { file, path, manifest } of artifacts) {
    const want = recorded.get(file)
    if (want === undefined) {
      problems.push(`${manifest.name}: ${file} has no entry in pnpm-lock.yaml`)
      continue
    }
    const actual = integrityOf(path)
    if (actual !== want) {
      problems.push(
        `${manifest.name}: lockfile integrity does not match ${file} on disk — re-run \`pnpm gate:install\``,
      )
      continue
    }
    matched++
  }

  for (const file of recorded.keys()) {
    if (!artifacts.some((a) => a.file === file)) {
      problems.push(`pnpm-lock.yaml references ${file}, which is not in artifacts/`)
    }
  }

  report('lockfile integrity', problems, `${matched}/${artifacts.length} match on-disk bytes`)
}

// ── Runner ───────────────────────────────────────────────────────────────

function main() {
  console.log('\nrelease-coherence\n')

  const { artifacts, unreadable } = readArtifacts()
  if (artifacts.length === 0 && unreadable.length === 0) {
    console.log('  no tarballs in artifacts/ — run `pnpm gate:pack` first\n')
    process.exit(1)
  }

  report('artifacts readable', unreadable, `${artifacts.length} tarball(s) parsed`)
  checkFilenameMatchesManifest(artifacts)
  checkSpecifiersMatchArtifacts(artifacts, readOverrides(), readTesterDeps())
  checkSingleVersionSet(artifacts)
  checkLockfileIntegrity(artifacts)

  console.log()
  if (failures.length) {
    console.log(`  INCOHERENT — ${failures.length}/${checkCount} check(s) failed: ${failures.join(', ')}\n`)
    process.exit(1)
  }
  console.log(`  COHERENT — ${checkCount}/${checkCount} checks passed\n`)
}

main()
