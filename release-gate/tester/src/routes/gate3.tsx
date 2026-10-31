import { createFileRoute } from '@tanstack/react-router'
import {
  Web3ConnectProvider,
  useWeb3,
  type Web3ConnectConfig,
} from '@naculus/connect-appkit-react'
import { eip6963Connector } from '@naculus/connector-evm-injected'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/gate3')({ component: Gate3Page })

const GATE3_RDNS = 'io.naculus.private-gate3'
const INITIAL_ACCOUNT = '0x1111111111111111111111111111111111111111'
const CHANGED_ACCOUNT = '0x2222222222222222222222222222222222222222'
const INITIAL_CHAIN = '0x1'
const SWITCHED_CHAIN = '0x89'

type Gate3Status = 'pass' | 'fail'

export interface Gate3Result {
  id: string
  status: Gate3Status
  detail: string
}

export interface Gate3Report {
  startedAt: string
  finishedAt: string
  results: Gate3Result[]
}

declare global {
  interface Window {
    __GATE3_RESULT__?: Gate3Report
    __GATE3_ERROR__?: string
  }
}

type Listener = (...args: unknown[]) => void

/** A deterministic EIP-1193 wallet used only by the private browser gate. */
function createGate3Provider() {
  let chainId = INITIAL_CHAIN
  let accounts = [INITIAL_ACCOUNT]
  const listeners = new Map<string, Set<Listener>>()

  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args)
  }

  const provider = {
    async request({ method, params = [] }: { method: string; params?: unknown[] }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return accounts
        case 'eth_chainId':
          return chainId
        case 'wallet_switchEthereumChain': {
          const next = (params[0] as { chainId?: string } | undefined)?.chainId
          if (!next) throw new Error('missing chainId')
          chainId = next
          emit('chainChanged', chainId)
          return null
        }
        case 'wallet_addEthereumChain':
          return null
        case 'personal_sign':
          return `0x${'ab'.repeat(65)}`
        case 'eth_sendTransaction':
          if (!Array.isArray(params) || !params[0]) {
            throw new Error('missing transaction')
          }
          return `0x${'cd'.repeat(32)}`
        case 'eth_getBalance':
          return '0xde0b6b3a7640000'
        case 'wallet_getCapabilities':
          return {}
        case 'eth_blockNumber':
          return '0x100'
        default:
          throw Object.assign(new Error(`unsupported method: ${method}`), { code: -32601 })
      }
    },
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(event, set)
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener)
    },
    setAccounts(next: string[]) {
      accounts = next
      emit('accountsChanged', accounts)
    },
    setChain(next: string) {
      chainId = next
      emit('chainChanged', chainId)
    },
  }

  return provider
}

const config: Web3ConnectConfig = {
  projectId: 'private-gate3',
  metadata: {
    name: 'Naculus private release gate',
    description: 'Deterministic local connector flow harness',
    url: 'https://localhost.test',
    icons: [],
  },
  chains: [
    { caip2: 'eip155:1', name: 'Ethereum', token: 'ETH' },
    { caip2: 'eip155:137', name: 'Polygon', token: 'MATIC' },
  ],
  autoRefreshFeeOnSwitch: false,
  storageKey: 'naculus-private-gate3',
}

function Gate3Page() {
  return <Gate3Harness />
}

/**
 * Standalone harness shared by the TanStack route and the focused production
 * gate. Keeping the provider flow independent from the app shell lets Gate 3
 * build a minimal page without pulling Gate 2's intentionally missing wagmi
 * peer into the production bundle.
 */
export function Gate3Harness() {
  return (
    <Web3ConnectProvider config={config} autoConnect={false}>
      <Gate3Runner />
    </Web3ConnectProvider>
  )
}

function Gate3Runner() {
  const { status, session, accounts, chainId, connectInjected, disconnect, switchChain, client } = useWeb3()
  const [report, setReport] = useState<Gate3Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const phase = useRef<'announce' | 'connect' | 'exercise' | 'done'>('announce')
  const providerRef = useRef<ReturnType<typeof createGate3Provider> | null>(null)
  const statusRef = useRef(status)
  const accountsRef = useRef(accounts)
  const chainIdRef = useRef(chainId)
  statusRef.current = status
  accountsRef.current = accounts
  chainIdRef.current = chainId

  useEffect(() => {
    let cancelled = false
    const startedAt = new Date().toISOString()
    const provider = createGate3Provider()
    providerRef.current = provider
    eip6963Connector.clear()
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: {
          info: { uuid: 'naculus-private-gate3', name: 'Naculus Test Wallet', icon: '', rdns: GATE3_RDNS },
          provider,
        },
      }),
    )
    phase.current = 'connect'

    void (async () => {
      try {
        await connectInjected(GATE3_RDNS)
      } catch (cause) {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        const failed: Gate3Report = {
          startedAt,
          finishedAt: new Date().toISOString(),
          results: [{ id: 'connect:injected', status: 'fail', detail: message }],
        }
        window.__GATE3_RESULT__ = failed
        window.__GATE3_ERROR__ = message
        setError(message)
        setReport(failed)
        phase.current = 'done'
      }
    })()

    return () => {
      cancelled = true
      providerRef.current = null
      eip6963Connector.clear()
    }
  }, [connectInjected])

  useEffect(() => {
    if (phase.current !== 'connect' || status !== 'connected' || !session) return
    phase.current = 'exercise'
    const provider = providerRef.current
    if (!provider) return

    void (async () => {
      const startedAt = new Date().toISOString()
      const results: Gate3Result[] = []
      const check = (id: string, condition: boolean, detail: string) =>
        results.push({ id, status: condition ? 'pass' : 'fail', detail })

      check('connect:injected', session.walletType === 'eip6963', `walletType=${session.walletType}`)
      check('connect:account', session.namespaces.eip155?.accounts?.[0]?.endsWith(INITIAL_ACCOUNT) === true, 'initial account available')

      // Let the provider commit its EIP-1193 event subscriptions before the
      // wallet emits the first external account event.
      await new Promise((resolve) => setTimeout(resolve, 0))
      provider.setAccounts([CHANGED_ACCOUNT])
      const accountDeadline = Date.now() + 2_000
      while (!accountsRef.current.some((account) => account.endsWith(CHANGED_ACCOUNT)) && Date.now() < accountDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      check('account-change:event', accountsRef.current.some((account) => account.endsWith(CHANGED_ACCOUNT)), 'accountsChanged updates the React provider state')

      const refreshed = await client.reconnect(session)
      check(
        'account-change:reconnect',
        refreshed.namespaces.eip155?.accounts?.[0]?.endsWith(CHANGED_ACCOUNT) === true,
        'reconnect adopts the wallet account after accountsChanged',
      )

      provider.setChain(SWITCHED_CHAIN)
      const chainDeadline = Date.now() + 2_000
      while (chainIdRef.current !== 'eip155:137' && Date.now() < chainDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      check('chain-change:event', chainIdRef.current === 'eip155:137', 'chainChanged updates the React provider state')

      await switchChain('eip155:1')
      check('chain-switch:provider', (await provider.request({ method: 'eth_chainId' })) === INITIAL_CHAIN, 'wallet_switchEthereumChain completed')

      const signature = await client.signMessage(refreshed, {
        message: 'naculus-gate3',
        address: `eip155:1:${CHANGED_ACCOUNT}`,
      })
      check('sign:accepted', typeof signature === 'string' && signature.length > 10, 'personal_sign result returned')

      const rpcError = new Error('deterministic RPC failure')
      const originalRequest = provider.request
      provider.request = async (request) => {
        if (request.method === 'eth_sendTransaction') throw rpcError
        return originalRequest.call(provider, request)
      }
      try {
        await client.sendTransaction(refreshed, { transaction: { to: CHANGED_ACCOUNT, value: '0x1' } })
        check('transaction:rpc-error', false, 'expected the wallet RPC error to propagate')
      } catch (cause) {
        check('transaction:rpc-error', cause === rpcError || String(cause).includes(rpcError.message), 'wallet RPC error propagated')
      } finally {
        provider.request = originalRequest
      }

      await disconnect()
      const deadline = Date.now() + 2_000
      while (statusRef.current === 'connected' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      check('disconnect:cleanup', statusRef.current === 'disconnected', `status=${statusRef.current}`)

      const finished: Gate3Report = { startedAt, finishedAt: new Date().toISOString(), results }
      window.__GATE3_RESULT__ = finished
      setReport(finished)
      phase.current = 'done'
    })().catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.stack ?? cause.message : String(cause)
      window.__GATE3_ERROR__ = message
      setError(message)
      phase.current = 'done'
    })
  }, [client, connectInjected, disconnect, session, status, switchChain])

  const passed = report?.results.filter((result) => result.status === 'pass').length ?? 0
  const failed = report?.results.filter((result) => result.status === 'fail').length ?? 0

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 data-testid="gate3-title" className="display-title mb-2 text-3xl font-bold tracking-tight text-[var(--sea-ink)]">
        Release Gate 3 — connector flows
      </h1>
      {!report && !error && <p data-gate3-state="running">Running deterministic wallet flows…</p>}
      {error && <pre data-gate3-state="error">{error}</pre>}
      {report && (
        <div data-gate3-state="done">
          <p>{passed} passed · {failed} failed</p>
          <ul>
            {report.results.map((result) => <li key={result.id} data-gate3-result={result.status}>{result.id}: {result.detail}</li>)}
          </ul>
        </div>
      )}
    </main>
  )
}
