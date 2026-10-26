import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readManifest, readTarball } from './tar.mjs'
import { groupLabel } from './sdk-layout.mjs'

function sourceUnavailable(repoDir, detail) {
  return new Error(`source package set unavailable at ${repoDir}: ${detail}`)
}

/** Discover the public, first-level packages in a repository. */
export function discoverPublicPackages(repoDir) {
  const packageRoot = join(repoDir, 'packages')
  let entries

  try {
    entries = readdirSync(packageRoot, { withFileTypes: true })
  } catch (error) {
    throw sourceUnavailable(repoDir, error.message)
  }

  const packages = []

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue

    const dir = join(packageRoot, entry.name)
    const manifestPath = join(dir, 'package.json')

    let hasManifest
    try {
      // A symlinked directory without a package.json remains a non-package
      // directory, matching pack.mjs's existing discovery behavior.
      hasManifest = existsSync(manifestPath)
    } catch (error) {
      throw sourceUnavailable(repoDir, `${dir}: ${error.message}`)
    }
    if (!hasManifest) continue

    if (entry.isSymbolicLink()) {
      throw sourceUnavailable(repoDir, `symlinked package directory: ${dir}`)
    }

    let manifestStat
    let manifest
    try {
      manifestStat = lstatSync(manifestPath)
      if (manifestStat.isSymbolicLink()) {
        throw sourceUnavailable(repoDir, `symlinked package.json: ${manifestPath}`)
      }
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      if (error.message.startsWith('source package set unavailable')) throw error
      throw sourceUnavailable(repoDir, `${manifestPath}: ${error.message}`)
    }

    if (manifest.private) continue
    packages.push({ dir, manifestPath, manifest })
  }

  packages.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))

  const names = new Set()
  for (const pkg of packages) {
    if (names.has(pkg.manifest.name)) {
      throw sourceUnavailable(repoDir, `duplicate public package: ${pkg.manifest.name}`)
    }
    names.add(pkg.manifest.name)
  }

  return packages
}

/** Discover the public packages from each SDK repository in one set. */
export function discoverPublicPackagesFromRepos(repoDirs) {
  return repoDirs.flatMap((repoDir) => discoverPublicPackages(repoDir))
}

/**
 * Map each public package name to the SDK repo directory it lives in. Lockstep
 * is per repo, and a name prefix cannot tell: @naculus/connect-native is an
 * appkit package without the connect-appkit prefix.
 */
export function repoOfPackages(repoDirs) {
  const repoOf = new Map()
  for (const repoDir of repoDirs) {
    for (const { manifest } of discoverPublicPackages(repoDir)) {
      repoOf.set(manifest.name, groupLabel(repoDir))
    }
  }
  return repoOf
}

/** Match the filename normalization already used by release-coherence.mjs. */
export function artifactFilename(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

/** Read every artifact manifest while preserving every unreadable diagnostic. */
export function readArtifactManifests(artifactDir) {
  let files
  try {
    files = readdirSync(artifactDir)
      .filter((file) => file.endsWith('.tgz'))
      .sort()
  } catch (error) {
    throw new Error(`artifact set unavailable at ${artifactDir}: ${error.message}`)
  }

  const artifacts = []
  const unreadable = []

  for (const file of files) {
    const path = join(artifactDir, file)
    try {
      artifacts.push({ file, path, manifest: readManifest(readTarball(path)) })
    } catch (error) {
      unreadable.push(`${file}: not a readable tarball — ${error.message}`)
    }
  }

  return { artifacts, unreadable }
}

/** Require exact equality and report both sides of a mismatch. */
export function assertExactPackageSet(expectedNames, actualNames, label) {
  const expected = new Set(expectedNames)
  const actual = new Set(actualNames)
  const missing = [...expected].filter((name) => !actual.has(name))
  const unexpected = [...actual].filter((name) => !expected.has(name))

  if (missing.length || unexpected.length) {
    throw new Error(
      `${label} mismatch; ` +
        `missing: ${missing.join(', ') || 'none'}; ` +
        `unexpected: ${unexpected.join(', ') || 'none'}`,
    )
  }
}
