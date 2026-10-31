/**
 * The whole fixture, in one file.
 *
 * Two things are being proved, and they fail independently:
 *
 *   B9 — `vite build` must succeed. connector-wagmi value-imports
 *        ChainNotConfiguredError and SwitchChainNotSupportedError from wagmi.
 *        While wagmi was an optional peer, a consumer without it got a stubbed
 *        module and Rollup died on MISSING_EXPORT. With wagmi a required peer
 *        and actually installed, the bindings resolve.
 *
 *   B4 — `tsc --noEmit` must succeed. connector-wagmi declares
 *        "types": "./dist/index.d.ts" but builds with `dts: false`, so the file
 *        it points at does not exist and TS7016 fires on the import below.
 *
 * A build failure is B9. A typecheck failure is B4. They are not the same
 * finding and must not be reported as one.
 *
 * No wallet is connected and no provider is mocked. `createConfig` only
 * assembles configuration; `http()` opens no socket until a request is made,
 * and none is.
 */

import { createNaculusConnector } from '@naculus/connector-wagmi'
import { createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'

const config = createConfig({
  chains: [mainnet],
  connectors: [
    createNaculusConnector({
      // Not a real WalletConnect project. Nothing here reaches the network.
      projectId: 'naculus-gate-fixture-placeholder',
      metadata: {
        name: 'Naculus wagmi consumer fixture',
        description: 'Release gate fixture — typecheck and production build only',
        url: 'https://example.invalid',
        icons: [],
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
})

const summary = {
  connectorCount: config.connectors.length,
  connectorTypes: config.connectors.map((c) => c.type),
  chainIds: config.chains.map((c) => c.id),
}

const out = document.querySelector('#out')
if (out) out.textContent = JSON.stringify(summary, null, 2)

// Surfaced for a future headless assertion; nothing reads it yet.
;(globalThis as Record<string, unknown>).__FIXTURE_RESULT__ = summary
