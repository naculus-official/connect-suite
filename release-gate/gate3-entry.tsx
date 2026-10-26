import { createRoot } from 'react-dom/client'

// A few transitive SDK utilities inspect Node's process object when they
// detect their runtime. The normal TanStack Start shell provides a browser
// shim; this focused Vite page deliberately has no app shell, so provide the
// smallest compatible shape before loading the SDK module.
const browserGlobal = globalThis as typeof globalThis & {
  process?: { env: Record<string, string>; platform: string; version: string; versions: Record<string, string> }
}
browserGlobal.process ??= {
  env: {},
  platform: 'browser',
  version: '',
  versions: {},
} as NonNullable<typeof browserGlobal.process>

const { Gate3Harness } = await import('./app/src/routes/gate3')
createRoot(document.getElementById('root')!).render(<Gate3Harness />)
