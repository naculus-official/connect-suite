#!/usr/bin/env node
/**
 * Pack the SDK repos into `artifacts/` so the gate can inspect real tarballs.
 *
 *   node release-gate/pack.mjs [--skip-build] [--only=connect-lib|connect-appkit]
 *     [--sdk-root=<directory>] [--artifact-dir=<directory>]
 *
 * The repos live as siblings of this tester and are packed in place; nothing
 * is written into them except each package's own `dist/`, which their own
 * build scripts own anyway.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { artifactFilename, discoverPublicPackages } from './lib/package-set.mjs'
import { groupDir, sdkRootFromArgs } from './lib/sdk-layout.mjs'

const here = import.meta.dirname
const skipBuild = process.argv.includes('--skip-build')

const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const only = onlyArg?.slice('--only='.length)
const sdkRoot = sdkRootFromArgs(process.argv)
const artifactDirArg = process.argv.find((a) => a.startsWith('--artifact-dir='))
const artifactDir = resolve(artifactDirArg?.slice('--artifact-dir='.length) ?? join(here, 'artifacts'))

const REPOS = [
  { name: 'connect-lib', dir: groupDir(sdkRoot, 'connect-lib') },
  { name: 'connect-appkit', dir: groupDir(sdkRoot, 'connect-appkit') },
].filter((r) => !only || r.name === only)

if (only && !REPOS.some((repo) => repo.name === only)) {
  throw new Error(`unknown --only value: ${only}`)
}

// Node >= 20 refuses to spawn .cmd shims without a shell (CVE-2024-27980),
// so on Windows pnpm has to go through cmd.exe. All args here are hard-coded.
const isWindows = process.platform === 'win32'

function run(args, cwd) {
  // Local desktop runtimes can have a different Corepack pnpm version than
  // the version pinned by the repository. PNPM_EXEC_PATH lets the caller use
  // an already-installed pnpm.mjs without changing the reproducible default.
  const pnpmExecPath = process.env.PNPM_EXEC_PATH
  const command = pnpmExecPath ? process.execPath : 'pnpm'
  const commandArgs = pnpmExecPath
    ? [pnpmExecPath, '--config.pm-on-fail=ignore', ...args]
    : args
  return execFileSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    shell: isWindows,
    env: {
      ...process.env,
      CI: 'true',
      npm_config_confirm_modules_purge: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function hasLocalLibArtifacts() {
  const libDir = groupDir(sdkRoot, 'connect-lib')
  if (!existsSync(libDir)) return false

  return discoverPublicPackages(libDir).every(({ manifest }) =>
    existsSync(join(artifactDir, artifactFilename(manifest.name, manifest.version))),
  )
}

/**
 * Build appkit against the packed connect-lib artifacts. connect-suite is one
 * workspace, so the override and lockfile live at the suite root; both are
 * restored byte-for-byte afterwards, so this convenience never leaves
 * generated dependency wiring in the repository.
 */
function buildAppkit(sdkRoot) {
  const workspacePath = join(sdkRoot, 'pnpm-workspace.yaml')
  const lockPath = join(sdkRoot, 'pnpm-lock.yaml')
  const snapshots = [workspacePath, lockPath]
    .filter((path) => existsSync(path))
    .map((path) => ({ path, contents: readFileSync(path) }))
  const canWireLocal = hasLocalLibArtifacts()

  try {
    if (canWireLocal) {
      execFileSync(process.execPath, [
        join(import.meta.dirname, 'wire-local-sdk.mjs'),
        `--sdk-root=${sdkRoot}`,
        `--artifact-dir=${artifactDir}`,
      ], { cwd: here, stdio: 'inherit' })
      run(['install', '--no-frozen-lockfile'], sdkRoot)
    }
    run(['-r', '--filter', './packages/appkit/packages/*', 'build'], sdkRoot)
  } finally {
    for (const snapshot of snapshots) writeFileSync(snapshot.path, snapshot.contents)
  }
}

/**
 * Appkit's Stencil build regenerates tracked wrapper sources. Snapshot those
 * exact paths so a release-gate run cannot overwrite local work, while still
 * allowing the repository's own build to run normally.
 */
function protectGeneratedSource(repoDir) {
  const root = mkdtempSync(join(tmpdir(), 'naculus-appkit-generated-'))
  const paths = [
    'packages/react/src/wc-generated',
    'packages/vue/src/wc-generated',
    // Stencil's dist-hydrate-script target rewrites this on every appkit build.
    'packages/wc/hydrate',
  ].map((path) => ({
    source: join(repoDir, path),
    snapshot: join(root, path),
  }))

  for (const entry of paths) {
    if (existsSync(entry.source)) cpSync(entry.source, entry.snapshot, { recursive: true })
  }

  return () => {
    try {
      for (const entry of paths) {
        rmSync(entry.source, { recursive: true, force: true })
        if (existsSync(entry.snapshot)) {
          mkdirSync(resolve(entry.source, '..'), { recursive: true })
          cpSync(entry.snapshot, entry.source, { recursive: true })
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

function main() {
  // A focused pack is composable: `--only=connect-lib` followed by
  // `--only=connect-appkit` must produce the same complete artifact set as a
  // single full pack. The installer still enforces the exact package set and
  // one-version invariant, so stale or missing artifacts cannot slip through.
  if (!only) rmSync(artifactDir, { recursive: true, force: true })
  mkdirSync(artifactDir, { recursive: true })

  for (const repo of REPOS) {
    if (!existsSync(repo.dir)) {
      console.log(`  skip ${repo.name} — not found at ${repo.dir}`)
      continue
    }

    if (!skipBuild) {
      console.log(`  building ${repo.name} ...`)
      const restore = repo.name === 'connect-appkit' ? protectGeneratedSource(repo.dir) : null
      try {
        if (repo.name === 'connect-appkit') buildAppkit(sdkRoot)
        else run(['-r', '--filter', './packages/lib/packages/*', 'build'], sdkRoot)
      } finally {
        restore?.()
      }
    }

    for (const { dir: pkgDir, manifest } of discoverPublicPackages(repo.dir)) {
      run(['pack', '--pack-destination', artifactDir], pkgDir)
      console.log(`  packed ${manifest.name}@${manifest.version}`)
    }
  }

  const count = readdirSync(artifactDir).filter((f) => f.endsWith('.tgz')).length
  console.log(`\n  ${count} tarball(s) in ${artifactDir}\n`)
}

main()
