import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const resolutionPath = join(root, 'sdk-resolution.json')
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const artifact = /^\.\/artifacts\/[^/]+\.tgz$/

export function loadSdkResolution(filePath = resolutionPath) {
  const config = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!config || typeof config.profiles !== 'object' || !config.profiles) {
    throw new Error('sdk-resolution.json must contain profiles')
  }
  const names = Object.keys(config.profiles)
  if (names.some((name) => !['npm', 'prebuilt'].includes(name))) {
    throw new Error(`unknown SDK profile: ${names.find((name) => !['npm', 'prebuilt'].includes(name))}`)
  }
  if (!['npm', 'prebuilt'].every((name) => config.profiles[name])) {
    throw new Error('profiles must include npm and prebuilt')
  }
  const [npm, prebuilt] = ['npm', 'prebuilt'].map((name) => config.profiles[name])
  for (const profile of [npm, prebuilt]) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('each profile must be a package spec map')
    for (const [name, spec] of Object.entries(profile)) {
      if (!name.startsWith('@naculus/')) throw new Error(`invalid package name: ${name}`)
      if (typeof spec !== 'string' || !(semver.test(spec) || artifact.test(spec))) {
        throw new Error(`invalid spec for ${name}: ${spec}`)
      }
    }
  }
  const npmNames = Object.keys(npm).sort()
  const prebuiltNames = Object.keys(prebuilt).sort()
  if (JSON.stringify(npmNames) !== JSON.stringify(prebuiltNames)) {
    throw new Error('npm and prebuilt profiles must cover the same package set')
  }
  return config
}

export function getInstallSpecMap(profile) {
  if (!['npm', 'prebuilt'].includes(profile)) throw new Error(`unknown SDK profile: ${profile}`)
  return { ...loadSdkResolution().profiles[profile] }
}
