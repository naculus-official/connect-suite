import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname)

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: resolve(root, 'dist-gate3'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, 'gate3.html'),
      // Gate 3 does not exercise optional SIWx adapters. Keep their dynamic
      // imports external so this focused production bundle remains usable by
      // consumers that intentionally install only the EVM dependencies.
      external: ['@cosmjs/amino', '@polkadot/keyring', 'starknet'],
    },
  },
})
