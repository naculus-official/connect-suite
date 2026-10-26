/**
 * Zero-dependency reader for npm `.tgz` tarballs.
 *
 * The gate must run before `pnpm install`, so it cannot rely on any npm
 * package to open the artifacts it is checking. Node's built-in zlib plus a
 * small ustar/GNU/pax parser is enough.
 */

import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const BLOCK = 512

function cstr(block, start, len) {
  const slice = block.subarray(start, start + len)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8')
}

/**
 * Read a .tgz and return a Map of entry path -> file contents.
 * npm tarballs put everything under `package/`; that prefix is stripped.
 */
export function readTarball(tgzPath) {
  const buf = gunzipSync(readFileSync(tgzPath))
  const entries = new Map()

  let offset = 0
  let pendingLongName = null
  let pendingPaxPath = null

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK)

    // Two consecutive zero blocks terminate the archive; one is enough for us.
    let allZero = true
    for (let i = 0; i < BLOCK; i++) {
      if (header[i] !== 0) {
        allZero = false
        break
      }
    }
    if (allZero) break

    const size = parseInt(cstr(header, 124, 12).trim(), 8) || 0
    const typeByte = header[156]
    const typeflag = String.fromCharCode(typeByte)

    const dataStart = offset + BLOCK
    const data = buf.subarray(dataStart, dataStart + size)
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK

    // GNU long name: the real path lives in this entry's payload.
    if (typeflag === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0+$/, '')
      continue
    }

    // pax extended header: look for a `path=` record.
    if (typeflag === 'x' || typeflag === 'X') {
      const match = data.toString('utf8').match(/\d+ path=([^\n]+)\n/)
      if (match) pendingPaxPath = match[1]
      continue
    }

    // Global pax header — not per-entry, ignore.
    if (typeflag === 'g') continue

    let name = cstr(header, 0, 100)
    const prefix = cstr(header, 345, 155)
    if (prefix) name = `${prefix}/${name}`
    if (pendingLongName) {
      name = pendingLongName
      pendingLongName = null
    }
    if (pendingPaxPath) {
      name = pendingPaxPath
      pendingPaxPath = null
    }

    // typeflag '0' and a raw NUL byte both mean "regular file".
    const isFile = typeflag === '0' || typeByte === 0
    if (!isFile) continue

    entries.set(name.replace(/^package\//, ''), Buffer.from(data))
  }

  return entries
}

/** Parse the package.json out of a tarball entry map. */
export function readManifest(entries) {
  const raw = entries.get('package.json')
  if (!raw) throw new Error('tarball has no package.json')
  return JSON.parse(raw.toString('utf8'))
}

/** Every string value reachable from an `exports` field, at any depth. */
export function collectExportTargets(exportsField) {
  const targets = []
  const walk = (node) => {
    if (typeof node === 'string') {
      targets.push(node)
      return
    }
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) walk(value)
    }
  }
  walk(exportsField)
  return targets
}
