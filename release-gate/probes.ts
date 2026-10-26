/**
 * Browser probes for Release Gate 2.
 *
 * Runs inside the page, never on the server. TanStack Start renders routes in
 * Node first, and Node *has* `process` — importing `@naculus/connect-core`
 * server-side succeeds and hides the very defect this gate exists to catch. So
 * every import below happens client-side, one package at a time, inside
 * try/catch, and the failure is reported rather than thrown.
 *
 * Import specifiers are written out literally in `IMPORTERS`. A computed
 * `import(name)` cannot be statically analysed: Vite would skip dependency
 * pre-bundling in dev and Rollup could not resolve it at build time, so the
 * gate would fail for reasons that have nothing to do with the SDK.
 */

export type ProbeStatus = 'pass' | 'fail' | 'skip'

export interface ProbeResult {
  id: string
  status: ProbeStatus
  /** Short machine-comparable reason, used to match against expectations.json */
  code: string
  detail: string
  exportCount?: number
}

export interface GateReport {
  mode: string
  startedAt: string
  finishedAt: string
  userAgent: string
  results: ProbeResult[]
}

// ── Package import probes (P1) ───────────────────────────────────────────

const IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  '@naculus/connect': () => import('@naculus/connect'),
  '@naculus/connect-core': () => import('@naculus/connect-core'),
  '@naculus/connector-coinbase': () => import('@naculus/connector-coinbase'),
  '@naculus/connector-embedded': () => import('@naculus/connector-embedded'),
  '@naculus/connector-evm-injected': () => import('@naculus/connector-evm-injected'),
  '@naculus/connector-passkeys': () => import('@naculus/connector-passkeys'),
  '@naculus/connector-reown': () => import('@naculus/connector-reown'),
  '@naculus/connector-safe': () => import('@naculus/connector-safe'),
  '@naculus/connector-solana': () => import('@naculus/connector-solana'),
  '@naculus/connector-solana-kit': () => import('@naculus/connector-solana-kit'),
  '@naculus/connector-wagmi': () => import('@naculus/connector-wagmi'),
  '@naculus/connector-walletconnect': () => import('@naculus/connector-walletconnect'),
  '@naculus/connector-xrpl': () => import('@naculus/connector-xrpl'),
  '@naculus/payments-mpp': () => import('@naculus/payments-mpp'),
  '@naculus/payments-x402': () => import('@naculus/payments-x402'),
  '@naculus/siwx': () => import('@naculus/siwx'),
  '@naculus/wallet-engine': () => import('@naculus/wallet-engine'),
  '@naculus/connect-appkit-wc': () => import('@naculus/connect-appkit-wc'),
  '@naculus/connect-appkit-react': () => import('@naculus/connect-appkit-react'),
  '@naculus/connect-appkit-vue': () => import('@naculus/connect-appkit-vue'),
  '@naculus/connect-appkit-ui': () => import('@naculus/connect-appkit-ui'),
}

export const PACKAGE_NAMES = Object.keys(IMPORTERS)

/**
 * Packages the production build could not bundle at all.
 *
 * When a package breaks the Rollup build outright the whole bundle is lost, and
 * with it every other package's result. The runner retries the build with the
 * offenders listed here so the remaining packages still get preview coverage;
 * the build failure itself is reported separately as its own probe.
 */
const SKIPPED = new Set(
  (import.meta.env?.VITE_GATE_SKIP ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean),
)

/** Classify an import failure into a stable code that expectations can match. */
function classify(error: unknown): { code: string; detail: string } {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : 'Error'

  if (/\bprocess is not defined\b/.test(message)) {
    return { code: 'process-is-not-defined', detail: message }
  }
  if (/\b(require|__dirname|__filename|global|Buffer) is not defined\b/.test(message)) {
    return { code: 'node-global-is-not-defined', detail: message }
  }
  if (/Failed to (fetch|resolve|load)|Cannot find module|does not provide an export/i.test(message)) {
    return { code: 'module-resolution', detail: message }
  }
  return { code: `${name.toLowerCase()}`, detail: message }
}

async function probeImports(): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []

  for (const name of PACKAGE_NAMES) {
    if (SKIPPED.has(name)) {
      results.push({
        id: `import:${name}`,
        status: 'skip',
        code: 'excluded-from-build',
        detail: 'excluded so the rest of the bundle could be built',
      })
      continue
    }
    try {
      const mod = await IMPORTERS[name]()
      const exportCount = Object.keys(mod).length
      results.push({
        id: `import:${name}`,
        status: 'pass',
        code: 'ok',
        detail: `imported, ${exportCount} export(s)`,
        exportCount,
      })
    } catch (error) {
      const { code, detail } = classify(error)
      results.push({ id: `import:${name}`, status: 'fail', code, detail })
    }
  }

  return results
}

// ── @naculus/connect must export something (P3 / B.4.4) ──────────────────

async function probeUmbrellaExports(): Promise<ProbeResult> {
  const id = 'umbrella:exports-non-empty'
  try {
    const mod = await IMPORTERS['@naculus/connect']()
    const keys = Object.keys(mod).filter((k) => k !== 'default' && k !== '__esModule')
    if (keys.length === 0) {
      return {
        id,
        status: 'fail',
        code: 'umbrella-empty',
        detail: '@naculus/connect resolved but exports nothing',
        exportCount: 0,
      }
    }
    return {
      id,
      status: 'pass',
      code: 'ok',
      detail: `${keys.length} export(s)`,
      exportCount: keys.length,
    }
  } catch (error) {
    const { code, detail } = classify(error)
    return { id, status: 'fail', code, detail }
  }
}

// ── wallet-engine Worker asset (P4 / B.4.5) ──────────────────────────────

/**
 * Storage stub for the worker probe.
 *
 * Holds nothing and persists nothing. `save()` records only that it was called
 * so the probe can tell the difference between "never reached" and "reached";
 * the WalletData it receives is discarded immediately and never leaves this
 * closure. No mnemonic, private key or address is retained or reported.
 */
function createDiscardingStorage() {
  let saveCalls = 0
  return {
    adapter: {
      type: 'memory' as const,
      isAvailable: () => true,
      load: async () => null,
      save: async () => {
        saveCalls += 1
      },
      clear: async () => {},
    },
    get saveCalls() {
      return saveCalls
    },
  }
}

async function probeWorkerAsset(): Promise<ProbeResult> {
  const id = 'wallet-engine:worker-asset'

  let mod: Record<string, unknown>
  try {
    mod = await IMPORTERS['@naculus/wallet-engine']()
  } catch (error) {
    const { code, detail } = classify(error)
    // The worker can only be reached once the package itself imports.
    return {
      id,
      status: 'fail',
      code: `blocked-by-import:${code}`,
      detail: `cannot reach worker code — package import failed: ${detail}`,
    }
  }

  const PocketWallet = mod.PocketWallet as
    | (new (config: Record<string, unknown>) => { generate: () => Promise<unknown> })
    | undefined

  if (typeof PocketWallet !== 'function') {
    return {
      id,
      status: 'fail',
      code: 'missing-export',
      detail: 'PocketWallet is not exported from @naculus/wallet-engine',
    }
  }

  const storage = createDiscardingStorage()
  try {
    const wallet = new PocketWallet({
      isolation: 'worker',
      storage: storage.adapter,
      autoSave: false,
      // 0.14 requires a passphrase for every storage backend. The probe's
      // storage discards records, so a fixed probe value encrypts nothing real.
      encryptionPassphrase: async () => 'gate-probe-passphrase',
    })
    await wallet.generate()
    return {
      id,
      status: 'pass',
      code: 'ok',
      detail: 'worker created and key material initialised in-worker',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      id,
      status: 'fail',
      code: 'worker-unavailable',
      detail: message,
    }
  }
}

// ── Runner ───────────────────────────────────────────────────────────────

export async function runProbes(mode: string): Promise<GateReport> {
  const startedAt = new Date().toISOString()

  const results = [
    ...(await probeImports()),
    await probeUmbrellaExports(),
    await probeWorkerAsset(),
  ]

  return {
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    results,
  }
}
