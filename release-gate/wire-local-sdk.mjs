#!/usr/bin/env node
/**
 * Configure a private appkit checkout to consume the freshly packed lib
 * artifacts without requiring a private npm registry during CI.
 *
 * The SDK repositories are intentionally separate workspaces. Appkit's
 * published manifests keep their normal semver ranges, while this temporary
 * pnpm override points those ranges at the exact local tarballs that Gate 1
 * will inspect and the tester will install.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { artifactFilename, discoverPublicPackages } from './lib/package-set.mjs'
import { groupDir, sdkRootFromArgs } from './lib/sdk-layout.mjs'

const here = import.meta.dirname
const artifactDirArg = process.argv.find((arg) => arg.startsWith('--artifact-dir='))
const sdkRoot = sdkRootFromArgs(process.argv)
const artifactDir = resolve(artifactDirArg?.slice('--artifact-dir='.length) ?? join(here, 'artifacts'))
// connect-suite is one workspace: the override lives in the root pnpm-workspace.yaml.
const workspacePath = join(sdkRoot, 'pnpm-workspace.yaml')
const artifactRelativePath = relative(sdkRoot, artifactDir).replaceAll('\\', '/')
const BEGIN = '# BEGIN naculus private CI local SDK overrides'
const END = '# END naculus private CI local SDK overrides'

const packages = discoverPublicPackages(groupDir(sdkRoot, 'connect-lib'))
const lines = packages.map(({ manifest }) => {
  const filename = artifactFilename(manifest.name, manifest.version)
  const artifactPath = join(artifactDir, filename)
  if (!existsSync(artifactPath)) throw new Error(`missing packed artifact: ${artifactPath}`)
  return `  '${manifest.name}': 'file:${artifactRelativePath}/${filename}'`
})

const existing = readFileSync(workspacePath, 'utf8')
const withoutPrevious = existing.replace(
  new RegExp(`\\r?\\n?${BEGIN}[\\s\\S]*?${END}\\r?\\n?`, 'g'),
  '\n',
)
const sorted = lines.sort()
// The suite root already declares overrides (zod, audit fixes). Merge the
// local mapping into that block instead of writing a second `overrides:` key,
// which YAML would reject. Restoring the snapshot removes it again.
const block = `${BEGIN}\n${sorted.join('\n')}\n${END}`
const overridesHeader = /^overrides:\s*$/m
if (overridesHeader.test(withoutPrevious)) {
  const merged = withoutPrevious.replace(overridesHeader, (header) => `${header}\n${block}`)
  writeFileSync(workspacePath, `${merged.trimEnd()}\n`)
} else {
  writeFileSync(workspacePath, `${withoutPrevious.trimEnd()}\n\noverrides:\n${block}\n`)
}
console.log(`wired ${packages.length} local connect-lib artifact override(s) into ${workspacePath}`)
