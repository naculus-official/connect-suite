import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the SDK lives. connect-suite is one pnpm workspace with two release
 * groups, so the gate works from one root and addresses each group by its
 * directory. Group labels keep the names the gate reports and checks against.
 */
// The gate lives inside connect-suite, so the repo root is the SDK root.
export const DEFAULT_SDK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const GROUP_PATHS = {
  'connect-lib': 'packages/lib',
  'connect-appkit': 'packages/appkit',
}

export function sdkRootFromArgs(argv) {
  const arg = argv.find((a) => a.startsWith('--sdk-root='))
  return resolve(arg?.slice('--sdk-root='.length) ?? DEFAULT_SDK_ROOT)
}

export function groupDir(sdkRoot, group) {
  const rel = GROUP_PATHS[group]
  if (!rel) throw new Error(`unknown SDK group: ${group}`)
  return join(sdkRoot, rel)
}

/** The group label for a group directory; falls back to the directory name. */
export function groupLabel(dir) {
  const normalized = dir.replaceAll('\\', '/')
  for (const [name, rel] of Object.entries(GROUP_PATHS)) {
    if (normalized.endsWith(rel)) return name
  }
  return basename(dir)
}
