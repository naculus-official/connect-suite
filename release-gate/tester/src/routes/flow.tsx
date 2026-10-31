import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Web3ConnectProvider,
  useAccount,
  useChain,
  useDisconnect,
  useSendTransaction,
  useSignMessage,
  useSwitchChain,
  useWeb3,
} from '@naculus/connect-appkit-react'

export const Route = createFileRoute('/flow')({
  component: FlowPage,
  head: () => ({ meta: [{ title: 'Naculus — End-to-end flow' }] }),
})

/**
 * End-to-end user flow against the real appkit build.
 *
 * The other routes exercise pieces: `/appkit` covers the UI components and the
 * embedded wallet, `/gate` and `/gate3` are release-gate dashboards. Nothing
 * walked a user from "no wallet" to "transaction sent", which is the sequence
 * that actually breaks when a connector regresses.
 *
 * Every step records its own outcome and the whole run is mirrored into
 * `window.__naculusFlow` and a <pre> block, so a human, Codex or Claude can
 * read the same result without a screenshot.
 */

const DEMO_RDNS = 'io.naculus.flow-demo'
const DEMO_ACCOUNT = '0x1234567890abcdef1234567890abcdef12345678'
const MAINNET = '0x1'

function createFlowProvider() {
  let chainId = MAINNET
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const emit = (event: string, ...args: unknown[]) => {
    for (const l of listeners.get(event) ?? []) l(...args)
  }
  return {
    async request({ method, params = [] }: { method: string; params?: unknown[] }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [DEMO_ACCOUNT]
        case 'eth_chainId':
          return chainId
        case 'wallet_switchEthereumChain': {
          const next = (params[0] as { chainId?: string } | undefined)?.chainId
          if (!next) throw new Error('wallet_switchEthereumChain requires chainId')
          chainId = next
          emit('chainChanged', chainId)
          return null
        }
        case 'eth_getBalance':
          return '0xde0b6b3a7640000'
        case 'wallet_getCapabilities':
          return {}
        case 'personal_sign':
          return `0x${'ab'.repeat(65)}`
        case 'eth_sendTransaction': {
          const tx = params[0] as { to?: string; chainId?: string } | undefined
          if (!tx?.to) throw new Error('eth_sendTransaction requires a "to" address')
          // Mirrors a real wallet: a transaction stamped for another chain is
          // refused rather than signed against whatever is currently selected.
          if (tx.chainId && tx.chainId !== chainId) {
            throw new Error(
              `chainId ${tx.chainId} does not match the selected chain ${chainId}`,
            )
          }
          return `0x${'cd'.repeat(32)}`
        }
        default:
          throw Object.assign(new Error(`Unsupported demo RPC: ${method}`), {
            code: -32601,
          })
      }
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener)
    },
  }
}

function announceFlowWallet() {
  if (typeof window === 'undefined') return
  const detail = Object.freeze({
    info: Object.freeze({
      uuid: '11111111-2222-3333-4444-555555555555',
      name: 'Naculus Flow Demo',
      icon: 'data:image/svg+xml;base64,PHN2Zy8+',
      rdns: DEMO_RDNS,
    }),
    provider: createFlowProvider(),
  })
  const announce = () =>
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
}

type StepState = 'pending' | 'running' | 'pass' | 'fail'
interface StepResult {
  name: string
  state: StepState
  detail?: string
}

const STEPS = [
  'connect',
  'account visible',
  'sign message',
  'switch chain',
  'account re-qualified',
  'send transaction',
  'disconnect',
] as const

function FlowRunner() {
  const [results, setResults] = useState<StepResult[]>(
    STEPS.map((name) => ({ name, state: 'pending' })),
  )
  const [running, setRunning] = useState(false)
  const { connectInjected } = useWeb3()
  const { disconnect } = useDisconnect()
  const { evmAccount: address, isConnected } = useAccount()
  const { chainId } = useChain()
  const { switchChain } = useSwitchChain()
  const { signMessage } = useSignMessage()
  const { sendTransaction } = useSendTransaction()
  const addressRef = useRef(address)
  const isConnectedRef = useRef(isConnected)
  const chainIdRef = useRef(chainId)
  const disconnectRef = useRef(disconnect)
  const signMessageRef = useRef(signMessage)
  const switchChainRef = useRef(switchChain)
  const sendTransactionRef = useRef(sendTransaction)
  addressRef.current = address
  isConnectedRef.current = isConnected
  chainIdRef.current = chainId
  disconnectRef.current = disconnect
  signMessageRef.current = signMessage
  switchChainRef.current = switchChain
  sendTransactionRef.current = sendTransaction

  const set = useCallback((i: number, state: StepState, detail?: string) => {
    setResults((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], state, detail }
      return next
    })
  }, [])

  const run = useCallback(async () => {
    setRunning(true)
    setResults(STEPS.map((name) => ({ name, state: 'pending' })))
    const step = async (i: number, fn: () => Promise<string | void>) => {
      set(i, 'running')
      try {
        const detail = await fn()
        set(i, 'pass', typeof detail === 'string' ? detail : undefined)
        return true
      } catch (error) {
        set(i, 'fail', error instanceof Error ? error.message : String(error))
        return false
      }
    }

    if (!(await step(0, async () => {
      await connectInjected(DEMO_RDNS)
      const deadline = Date.now() + 2_000
      while (
        (!isConnectedRef.current || !addressRef.current) &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, 25))
      }
      if (!isConnectedRef.current || !addressRef.current) {
        throw new Error('wallet connection did not produce an active account')
      }
    }))) return setRunning(false)
    if (!(await step(1, async () => {
      const a = addressRef.current
      if (!a) throw new Error('no account after connect')
      return a
    }))) return setRunning(false)
    await step(2, async () => (await signMessageRef.current('naculus flow check')).slice(0, 22) + '…')
    await step(3, async () => {
      await switchChainRef.current('eip155:137')
      const deadline = Date.now() + 2_000
      while (chainIdRef.current !== 'eip155:137' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25))
      }
      if (chainIdRef.current !== 'eip155:137') {
        throw new Error(`chain remained ${chainIdRef.current ?? 'unknown'}`)
      }
      return 'eip155:137'
    })
    await step(4, async () => {
      const a = addressRef.current
      if (!a) throw new Error('account lost after chain switch')
      return a
    })
    await step(5, async () =>
      (await sendTransactionRef.current({ to: DEMO_ACCOUNT, value: '0x0' })).slice(0, 22) + '…',
    )
    await step(6, async () => { await disconnectRef.current() })
    setRunning(false)
  }, [connectInjected, set])

  const summary = useMemo(() => {
    const pass = results.filter((r) => r.state === 'pass').length
    const fail = results.filter((r) => r.state === 'fail').length
    return { pass, fail, total: STEPS.length, results }
  }, [results])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__naculusFlow = summary
  }, [summary])

  const icon = (s: StepState) =>
    s === 'pass' ? '✓' : s === 'fail' ? '✗' : s === 'running' ? '…' : '·'

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-lg bg-[var(--sea-ink)] px-4 py-2 text-white disabled:opacity-50"
      >
        {running ? 'Running…' : 'Run full flow'}
      </button>

      <ol className="space-y-1 font-mono text-sm">
        {results.map((r) => (
          <li key={r.name} data-step={r.name} data-state={r.state}>
            <span className="inline-block w-5">{icon(r.state)}</span>
            <span className="inline-block w-52">{r.name}</span>
            {r.detail && (
              <span className={r.state === 'fail' ? 'text-red-600' : 'opacity-60'}>
                {r.detail}
              </span>
            )}
          </li>
        ))}
      </ol>

      <p className="text-sm opacity-70">
        account: {address ?? '—'} · chain: {chainId ?? '—'} · connected:{' '}
        {String(isConnected)}
      </p>

      <pre
        data-testid="flow-summary"
        className="overflow-x-auto rounded-lg bg-black/5 p-3 text-xs"
      >
        {JSON.stringify(summary, null, 2)}
      </pre>
    </div>
  )
}

function FlowPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    announceFlowWallet()
    setReady(true)
  }, [])

  const config = useMemo(
    () => ({
      projectId: 'naculus-flow-demo',
      metadata: {
        name: 'Naculus Flow',
        description: 'End-to-end connector flow',
        url: 'http://localhost:3000',
        icons: [],
      },
    }),
    [],
  )

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rounded-[2rem] px-6 py-10 sm:px-10">
        <p className="island-kicker mb-3">Live appkit</p>
        <h1 className="display-title mb-3 text-3xl font-bold">
          End-to-end flow
        </h1>
        <p className="mb-8 max-w-2xl text-[var(--sea-ink-soft)]">
          Runs connect → sign → switch chain → send → disconnect against the
          installed AppKit build with a deterministic mock wallet transport.
          It validates SDK control flow, not chain inclusion. Results are mirrored to{' '}
          <code>window.__naculusFlow</code>.
        </p>
        {ready ? (
          <Web3ConnectProvider config={config} autoConnect={false}>
            <FlowRunner />
          </Web3ConnectProvider>
        ) : (
          <p className="opacity-60">preparing demo wallet…</p>
        )}
      </section>
    </main>
  )
}
