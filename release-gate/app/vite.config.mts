import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The tester is intentionally installable before SDK artifacts exist. Keep
// optional probe imports external in that baseline build; gate:install places
// real tarballs in node_modules, after which Vite resolves and bundles them.
const testerRoot = resolve(import.meta.dirname, '..')
const sdkInstalled = existsSync(resolve(testerRoot, 'node_modules/@naculus/connect/package.json'))
const gateSkippedPackages = new Set(
  (process.env.VITE_GATE_SKIP ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
)

function isGateSkipped(id: string): boolean {
  return [...gateSkippedPackages].some(
    (name) => id === name || id.startsWith(`${name}/`),
  )
}

const config = defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  build: {
    rollupOptions: {
      external: sdkInstalled
        ? gateSkippedPackages.size > 0
          ? isGateSkipped
          : undefined
        : (id) => id.startsWith('@naculus/'),
    },
  },
  // Stencil's generated React/Vue wrappers are intentionally left as source
  // modules. Vite's dep optimizer can cache a failed pre-bundle for these
  // mixed ESM/CJS packages, while the browser gate needs to observe the real
  // package resolution path.
  optimizeDeps: {
    exclude: sdkInstalled
      ? [
          '@naculus/connect-appkit-react',
          '@naculus/connect-appkit-ui',
          '@naculus/connect-appkit-vue',
          '@naculus/connect-appkit-wc',
        ]
      : [],
  },
  // The tester's node_modules is intentionally shared with the sibling SDK
  // repositories. Vite resolves file-tarball symlinks to that workspace path;
  // allow the sibling root so browser workers (crypto-worker.js) can be served
  // instead of being rejected as an out-of-root /@fs request.
  server: {
    fs: { allow: [resolve(testerRoot, '..', '..')] },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})

export default config
