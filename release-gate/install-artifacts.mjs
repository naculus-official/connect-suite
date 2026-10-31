#!/usr/bin/env node
/**
 * Wire the packed SDK tarballs into this tester as `file:` dependencies.
 *
 *   node release-gate/install-artifacts.mjs
 *
 * Two things have to happen, and only doing the first is a trap:
 *
 *  1. Each tarball becomes a direct `file:` dependency, so the gate imports
 *     exactly the bytes that `pnpm pack` produced.
 *
 *  2. Every `@naculus/*` name also goes into `pnpm.overrides`. `pnpm pack`
 *     rewrites `workspace:*` into a fixed version — `@naculus/connect` ships
 *     with a fixed version — so without an override pnpm
 *     resolves the umbrella's transitive dependencies from the public registry
 *     and the gate silently tests published code instead of local artifacts.
 *
 * Installs with `--force` because pnpm caches `file:` tarballs by path, and a
 * re-packed tarball at the same path would otherwise be ignored.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  artifactFilename,
  assertExactPackageSet,
  discoverPublicPackagesFromRepos,
  readArtifactManifests,
  repoOfPackages,
} from './lib/package-set.mjs'
import { groupDir, sdkRootFromArgs } from './lib/sdk-layout.mjs'
import { getInstallSpecMap } from './lib/sdk-resolution.mjs'

const here = import.meta.dirname
const sdkRoot = sdkRootFromArgs(process.argv)
const artifactDirArg = process.argv.find((a) => a.startsWith('--artifact-dir='))
const artifactDir = resolve(artifactDirArg?.slice('--artifact-dir='.length) ?? join(here, 'artifacts'))
const profileArg = process.argv.find((a) => a.startsWith('--profile='))
const profile = profileArg?.slice('--profile='.length)
const manifestPath = join(here, 'package.json')

// Node >= 20 refuses to spawn .cmd shims without a shell (CVE-2024-27980).
const isWindows = process.platform === 'win32'

/**
 * Rewrite the `overrides:` block in pnpm-workspace.yaml, preserving anything
 * else already in the file. Hand-rolled rather than pulling in a YAML parser —
 * this script has to keep working when the tester's dependencies are broken.
 */
function renderWorkspaceOverrides(existing, specs) {
  // Strip a previous overrides block (the key and its indented body).
  const withoutOverrides = existing.replace(/^overrides:\r?\n(?:[ \t]+.*\r?\n?)*/gm, '')

  const block = [
    'overrides:',
    ...[...specs]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, spec]) => `  '${name}': '${spec}'`),
  ].join('\n')

  const body = `${withoutOverrides.trimEnd()}\n\n${block}\n`.replace(/^\n+/, '')
  return body
}

/** Group artifact versions by the SDK repo that releases them in lockstep. */
function versionsByRepo(artifacts, repoOf) {
  const groups = new Map()
  for (const { manifest } of artifacts) {
    const repo = repoOf.get(manifest.name)
    if (!groups.has(repo)) groups.set(repo, new Set())
    groups.get(repo).add(manifest.version)
  }
  return groups
}

function main() {
  const specs = new Map()
  if (profile !== 'npm') {
    const repoDirs = [groupDir(sdkRoot, 'connect-lib'), groupDir(sdkRoot, 'connect-appkit')]
    const expected = new Set(
      discoverPublicPackagesFromRepos(repoDirs).map(({ manifest }) => manifest.name),
    )
    const { artifacts, unreadable } = readArtifactManifests(artifactDir)

    if (unreadable.length) {
      throw new Error(
        `unreadable artifact(s):\n  ${unreadable.join('\n  ')}`,
      )
    }

    if (artifacts.length !== expected.size) {
      throw new Error(`expected ${expected.size} artifacts, found ${artifacts.length}`)
    }

    const actual = new Set()
    for (const { file, manifest } of artifacts) {
      if (file !== artifactFilename(manifest.name, manifest.version)) {
        throw new Error(`${file} does not match ${manifest.name}@${manifest.version}`)
      }
      if (actual.has(manifest.name)) {
        throw new Error(`duplicate artifact package: ${manifest.name}`)
      }
      actual.add(manifest.name)
      specs.set(manifest.name, `file:./artifacts/${file}`)
    }

    assertExactPackageSet(expected, actual, 'artifact package set')
    // Lockstep is per SDK repo, not across repos: connect-appkit can ship a
    // patch while connect-lib stays put (0.2.6 / 0.2.5 was the first such case).
    for (const [repo, repoVersions] of versionsByRepo(artifacts, repoOfPackages(repoDirs))) {
      if (repoVersions.size !== 1) {
        throw new Error(
          `${repo} artifact version set is not unified: ${[...repoVersions].join(', ')}`,
        )
      }
    }
  }

  // Profile mode uses the centrally validated spec map. The artifact-driven
  // behavior above remains unchanged when --profile is omitted.
  if (profile) {
    specs.clear()
    for (const [name, spec] of Object.entries(getInstallSpecMap(profile))) {
      specs.set(name, spec.startsWith('./artifacts/') ? `file:${spec}` : spec)
    }
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const workspacePath = join(here, 'pnpm-workspace.yaml')
  const existingWorkspace = existsSync(workspacePath)
    ? readFileSync(workspacePath, 'utf8')
    : null

  // Drop any previous @naculus entries so a re-pack at a new version does not
  // leave a stale specifier behind.
  const keepOthers = (obj = {}) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('@naculus/')))

  manifest.dependencies = {
    ...keepOthers(manifest.dependencies),
    ...Object.fromEntries([...specs].sort(([a], [b]) => a.localeCompare(b))),
  }

  // pnpm >= 11.20 no longer reads `overrides` from package.json; it lives in
  // pnpm-workspace.yaml. Writing it to the old location fails silently, which
  // is how the umbrella's transitive deps first resolved from the registry
  // instead of from our tarballs.
  delete manifest.pnpm?.overrides
  if (manifest.pnpm && Object.keys(manifest.pnpm).length === 0) delete manifest.pnpm

  const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`
  const nextWorkspace = renderWorkspaceOverrides(existingWorkspace ?? '', specs)

  // All validation and desired-content calculation is complete before this point.
  // Keep the gate transactional: a failed install (for example, because the
  // registry is unavailable) must not leave a half-written manifest or lockfile.
  const lockfilePath = join(here, 'pnpm-lock.yaml')
  const snapshots = new Map([
    [manifestPath, readFileSync(manifestPath, 'utf8')],
    [workspacePath, existingWorkspace],
    [lockfilePath, existsSync(lockfilePath) ? readFileSync(lockfilePath, 'utf8') : null],
  ])

  try {
    writeFileSync(manifestPath, nextManifest)
    writeFileSync(workspacePath, nextWorkspace)

    // pnpm can retain a virtual-store snapshot when a `file:` dependency is
    // repacked at the same path. Remove only the generated @naculus artifact
    // links so the next install must read the current tarball bytes; otherwise
    // the browser provenance check may silently exercise a previous build.
    const virtualStore = join(here, 'node_modules', '.pnpm')
    if (existsSync(virtualStore)) {
      for (const entry of readdirSync(virtualStore)) {
        if (entry.startsWith('@naculus+') && entry.includes('+file+artifacts+')) {
          rmSync(join(virtualStore, entry), { recursive: true, force: true })
        }
      }
    }
    for (const name of specs.keys()) {
      rmSync(join(here, 'node_modules', ...name.split('/')), { recursive: true, force: true })
    }

    console.log(`\n  wired ${specs.size} tarball(s) into package.json + pnpm-workspace.yaml`)
    for (const name of [...specs.keys()].sort()) console.log(`    ${name}`)

    console.log('\n  pnpm install --force ...\n')
    // The artifact set and workspace overrides are intentionally generated at
    // gate time, so a frozen lockfile would reject the transition before pnpm
    // can record those exact tarball resolutions.
    execFileSync('pnpm', ['install', '--force', '--no-frozen-lockfile'], {
      cwd: here,
      stdio: 'inherit',
      shell: isWindows,
      env: {
        ...process.env,
        CI: 'true',
        npm_config_confirm_modules_purge: 'false',
      },
    })
  } catch (error) {
    for (const [path, content] of snapshots) {
      if (content === null) {
        if (existsSync(path)) unlinkSync(path)
      } else {
        writeFileSync(path, content)
      }
    }
    console.error('\n  pnpm install failed; restored package.json, pnpm-workspace.yaml, and pnpm-lock.yaml')
    throw error
  }
}

main()
