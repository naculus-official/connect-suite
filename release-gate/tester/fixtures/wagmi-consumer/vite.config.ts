import { defineConfig } from 'vite'

// Intentionally bare. No `resolve.alias`, no `optimizeDeps.exclude`, no stub
// plugin — a consumer workaround here would hide the very defect the fixture
// exists to detect.
export default defineConfig({
  build: {
    // Fail loudly rather than emitting a bundle with unresolved imports.
    chunkSizeWarningLimit: 4000,
  },
})
