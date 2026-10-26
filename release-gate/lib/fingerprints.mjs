/**
 * Byte-level fingerprints used to detect code that was inlined into a bundle
 * rather than left as an external import.
 *
 * Every fingerprint below was verified against connect-lib@0.1.6 as a string
 * that occurs in exactly one source package. String literals survive esbuild
 * minification, so they remain reliable in `minify: true` output.
 */

/** Workspace packages that must never be inlined into a sibling's bundle. */
export const WORKSPACE_FINGERPRINTS = [
  {
    owner: '@naculus/connect-core',
    // packages/core/src/storage.ts — localStorage availability probe key
    markers: ['__storage_test__', 'naculus_web3_session_manager'],
  },
  {
    owner: '@naculus/siwx',
    // packages/siwx/src/verify.ts — replay-rejection error string
    markers: ['unissued nonce'],
  },
]

/**
 * Third-party libraries that carry security-relevant code. If one of these is
 * inlined, downstream consumers can never patch it: no dependency bump and no
 * pnpm `overrides` entry can reach a vendored copy.
 */
export const VENDORED_FINGERPRINTS = [
  {
    pkg: 'bs58',
    // The base58 alphabet alone is NOT enough: connect-core hand-rolls base58
    // in resolver/providers/sns.ts and would false-positive. These two strings
    // come from base-x, which only ships as part of bs58.
    markers: ['Non-zero carry', 'Alphabet too long'],
  },
  {
    pkg: 'ripple-keypairs',
    markers: ['deriveKeypair', 'deriveNodeAddress'],
  },
  {
    pkg: 'tweetnacl',
    // Internal identifiers are mangled by minification; these error strings are not.
    markers: ['bad secret key size', 'crypto_sign_BYTES'],
  },
]

/**
 * Globals that do not exist in a browser. A bundled library that references
 * these at module scope throws on import and takes the whole SDK down with it.
 */
export const BROWSER_UNSAFE_GLOBALS = [
  { pattern: /process\.env\.[A-Za-z_][A-Za-z0-9_]*/g, name: 'process.env' },
  { pattern: /\brequire\s*\(/g, name: 'require()' },
  { pattern: /\b__dirname\b/g, name: '__dirname' },
  { pattern: /\b__filename\b/g, name: '__filename' },
]

/** Packages that pull in a framework and must stay out of framework-neutral builds. */
export const FRAMEWORK_COUPLED = [
  'react',
  'react-dom',
  '@naculus/connect-appkit-react',
  '@naculus/connect-appkit-ui',
  'vue',
  '@naculus/connect-appkit-vue',
]

/** Files that have no business being inside a published tarball. */
export const PUBLISH_LEAK_PATTERNS = [
  /^src\//,
  /^test\//,
  /^tests\//,
  /(^|\/)__tests__\//,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.stories\.[cm]?[jt]sx?$/,
  /^tsup\.config\./,
  /^stencil\.config\./,
  /^vitest\.config\./,
  /^tsconfig(\.\w+)?\.json$/,
]

/** `new URL('./worker.js', import.meta.url)` — how a Worker asset is referenced. */
export const WORKER_URL = /new URL\(\s*["'](\.\/[^"']+\.js)["']/g

/**
 * Import specifiers, as they survive minification.
 *
 * The lookbehinds are not decoration. `from` and `import` also occur inside
 * string literals — an ERC-20 ABI entry reads `{name:"from",type:"address"}` —
 * and without them that matches, reporting ",type:" as an import specifier.
 * Verified against connect-core's built bundle, which contains exactly that.
 */
const SPECIFIER_PATTERNS = [
  /(?<=[\s};*)])from\s*["']([^"']+)["']/g,
  /(?<![\w$."'])import\s*\(\s*["']([^"']+)["']/g,
  /(?<![\w$."'])import\s*["']([^"']+)["']/g,
]

/**
 * Can a module worker resolve this specifier by itself?
 *
 * A worker created from a URL has no bundler and no import map, so only
 * relative paths, absolute paths and fetchable URL schemes work. Bare package
 * names do not — and neither does `node:`, which is a builtin no browser has.
 */
const workerResolvable = (spec) =>
  spec.startsWith('./') ||
  spec.startsWith('../') ||
  spec.startsWith('/') ||
  /^(?:https?|data|blob):/.test(spec)

/**
 * Node-only globals, checked against Worker assets specifically.
 *
 * BROWSER_UNSAFE_GLOBALS above covers the same ground for the main bundle, but
 * reports a warning: a consumer's bundler usually shims `process`, and Gate 2
 * proved Vite does. A module worker gets no such help — `new Worker(url)` loads
 * it directly, outside the bundler's reach — so the same pattern is fatal there
 * and is checked separately, as a failure.
 */
export const WORKER_NODE_GLOBALS = [
  { pattern: /globalThis\.process\b/g, name: 'globalThis.process' },
  { pattern: /\bprocess\./g, name: 'process.' },
  { pattern: /\brequire\s*\(/g, name: 'require(' },
  { pattern: /\b__dirname\b/g, name: '__dirname' },
  { pattern: /\b__filename\b/g, name: '__filename' },
]

/** Node-only globals present in `code`, with a sample of each match. */
export function workerNodeGlobals(code) {
  const hits = []
  for (const { pattern, name } of WORKER_NODE_GLOBALS) {
    const found = code.match(pattern)
    if (found) hits.push(`${name} x${found.length}`)
  }
  return hits
}

/**
 * Specifiers in `code` that a browser worker could not resolve.
 *
 * This is deliberately not "the bundle must have zero imports" — relative
 * chunk imports are a legitimate way to split a worker. It only rejects
 * specifiers that need a resolver the worker does not have.
 */
export function browserUnresolvableSpecifiers(code) {
  const found = new Set()
  for (const re of SPECIFIER_PATTERNS) {
    for (const m of code.matchAll(re)) {
      if (!workerResolvable(m[1])) found.add(m[1])
    }
  }
  return [...found]
}
