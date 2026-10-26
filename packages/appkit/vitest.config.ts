import { defineConfig } from 'vitest/config'
import path from "path"
import { getAliases } from './test-utils/aliases'

const root = __dirname
const wcDist = path.join(root, "packages/wc/dist")

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@naculus\/connect-appkit-wc\/dist\/(.*)/, replacement: `${wcDist}/$1` },
      ...Object.entries(getAliases(root)).map(([find, replacement]) => ({ find, replacement: replacement as string })),
    ],
    conditions: ['import', 'node'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        // The current full-suite baseline is 46.94/45.21/48.84/47.64.
        // Keep a modest floor so new hooks and UI branches do not silently
        // reduce the consumer-facing test surface.
        statements: 45,
        branches: 40,
        functions: 45,
        lines: 45,
      },
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/node_modules/**', '**/dist/**'],
    },
  },
})
