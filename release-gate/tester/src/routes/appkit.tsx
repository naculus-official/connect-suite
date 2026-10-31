import { createFileRoute } from '@tanstack/react-router'
import {
  AppKit,
  AppKitButton,
  AppKitChainSelector,
  QRCodeModal,
  SeedPhraseBackup,
  useAppKit,
} from '@naculus/connect-appkit-ui'
import {
  type DelegationPolicyPreview,
  useAccount,
  useBalance,
  useDelegationPolicy,
  useEmbeddedWallet,
  useSendTransaction,
  useWallet,
} from '@naculus/connect-appkit-react'
import { eip6963Connector } from '@naculus/connector-evm-injected'
import {
  describeTimeline,
  endToEnd,
  type PaymentTimeline,
  recordStage,
  startTimeline,
  timelineLegs,
} from '@naculus/connect-core'
import { useEffect, useMemo, useState } from 'react'
import {
  createZeroDev7702Adapter,
  initializeZeroDev7702Permission,
  loadZeroDev7702Approval,
  readZeroDevRpcUrl,
  revokeZeroDev7702Permission,
  verifyZeroDevSepoliaRpc,
  waitForZeroDevUserOperation,
  type ZeroDevUserOperationEvidence,
} from '../lib/zerodev-7702'
import '@naculus/connect-appkit-ui/styles'

export const Route = createFileRoute('/appkit')({
  component: AppKitDemoPage,
  head: () => ({ meta: [{ title: 'Naculus AppKit Demo' }] }),
})

const DEMO_RDNS = 'io.naculus.local-demo'
const DEMO_ACCOUNT = '0x1234567890abcdef1234567890abcdef12345678'
const SEPOLIA_CAIP2 = 'eip155:11155111'
const SEPOLIA_CHAIN_ID = 11155111
const SEPOLIA_RPC_URL = 'https://ethereum-sepolia.publicnode.com'
const SEPOLIA_EXPLORER_URL = 'https://sepolia.etherscan.io'
// Irrecoverable 1 wei proof receiver. Using the owner itself is not a payment
// proof and ZeroDev intentionally optimizes same-account calls as Kernel calls.
const SENDERPAY_TEST_RECIPIENT = '0x000000000000000000000000000000000000dEaD'
const LIVE_WALLET_STORAGE_KEY = 'naculus_pocket_sepolia_live_v1'
const POLICY_MANAGER_CONFIG = {
  storagePrefix: 'naculus_appkit_policy_demo_v1',
  // Tester-only stable material so the encrypted record survives reload.
  // A production host must derive this from its authenticated key boundary.
  encryptionKey: 'naculus-local-tester-only-policy-encryption-key',
  requireAllowedContracts: true,
}
const ZERO_DEV_CONFIGURATION = (() => {
  try {
    return { rpcUrl: readZeroDevRpcUrl(), error: null }
  } catch (error) {
    return {
      rpcUrl: null,
      error: error instanceof Error ? error.message : 'ZeroDev RPC configuration is invalid.',
    }
  }
})()
const SEPOLIA_CHAINS = [
  {
    caip2: SEPOLIA_CAIP2,
    name: 'Sepolia',
    rpcUrl: SEPOLIA_RPC_URL,
    explorerUrl: SEPOLIA_EXPLORER_URL,
    token: 'ETH',
  },
]

type JsonRpcResponse<T> = {
  result?: T
  error?: { code?: number; message?: string }
}

type SepoliaReceipt = {
  blockNumber: `0x${string}`
  gasUsed: `0x${string}`
  effectiveGasPrice: `0x${string}`
  status: `0x${string}`
  transactionHash: `0x${string}`
}

type SepoliaTransaction = {
  from: `0x${string}`
  hash: `0x${string}`
  to: `0x${string}` | null
  value: `0x${string}`
}

type LiveTransactionEvidence = {
  hash: `0x${string}`
  receiptStatus: 'success'
  blockNumber: number
  confirmations: number
  from: `0x${string}`
  to: `0x${string}`
  valueWei: string
  beforeBalanceWei: string
  afterBalanceWei: string
  gasCostWei: string
  gasUsed: string
  effectiveGasPriceWei: string
  beforeNonce: number
  afterNonce: number
  verifiedAt: string
}

async function probePersistedWalletAddress(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    // Omit a version so this read-only tester probe opens whichever schema the
    // installed wallet-engine owns. Pinning v1 fails after legitimate schema
    // upgrades and can create a stale empty v1 database on a fresh origin.
    const openRequest = indexedDB.open('naculus_wallet')
    openRequest.onerror = () => reject(new Error('IndexedDB open failed'))
    openRequest.onsuccess = () => {
      const database = openRequest.result
      if (!database.objectStoreNames.contains('wallets')) {
        database.close()
        resolve(null)
        return
      }
      const transaction = database.transaction('wallets', 'readonly')
      const request = transaction.objectStore('wallets').get(LIVE_WALLET_STORAGE_KEY)
      request.onerror = () => reject(new Error('IndexedDB wallet read failed'))
      request.onsuccess = () => {
        const accounts = request.result?.data?.accounts as
          | Array<{ namespace?: string; address?: string }>
          | undefined
        database.close()
        resolve(accounts?.find((account) => account.namespace === 'eip155')?.address ?? null)
      }
    }
  })
}

async function sepoliaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(SEPOLIA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
  })
  if (!response.ok) {
    throw new Error(`Sepolia RPC HTTP ${response.status}`)
  }
  const payload = await response.json() as JsonRpcResponse<T>
  if (payload.error) {
    throw new Error(`Sepolia RPC ${payload.error.code ?? 'error'}: ${payload.error.message ?? 'unknown error'}`)
  }
  if (payload.result === undefined) {
    throw new Error(`Sepolia RPC ${method} returned no result`)
  }
  return payload.result
}

async function waitForSepoliaReceipt(
  hash: `0x${string}`,
  requiredConfirmations = 2,
  timeoutMs = 240_000,
): Promise<{ receipt: SepoliaReceipt; confirmations: number }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const receipt = await sepoliaRpc<SepoliaReceipt | null>(
      'eth_getTransactionReceipt',
      [hash],
    )
    if (receipt) {
      const latestBlock = BigInt(await sepoliaRpc<`0x${string}`>('eth_blockNumber', []))
      const receiptBlock = BigInt(receipt.blockNumber)
      const confirmations = Number(latestBlock - receiptBlock + 1n)
      if (confirmations >= requiredConfirmations) return { receipt, confirmations }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3_000))
  }
  throw new Error(`Timed out waiting for ${requiredConfirmations} Sepolia confirmations`)
}

type DemoProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void
}

function createDemoProvider(): DemoProvider {
  let chainId = '0x1'
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args)
  }

  return {
    async request({ method, params = [] }) {
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
        default:
          throw Object.assign(new Error(`Unsupported demo RPC method: ${method}`), { code: -32601 })
      }
    },
    on(event, listener) {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
    },
  }
}

function useDemoInjectedWallet() {
  useEffect(() => {
    const provider = createDemoProvider()
    const announce = () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: 'naculus-local-demo-wallet',
              name: 'Naculus Demo Wallet',
              icon: '',
              rdns: DEMO_RDNS,
            },
            provider,
          },
        }),
      )
    }

    eip6963Connector.clear()
    window.addEventListener('eip6963:requestProvider', announce)
    const timer = window.setTimeout(announce, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('eip6963:requestProvider', announce)
      eip6963Connector.clear()
    }
  }, [])
}

function makeDemoWalletConnectUri(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `wc:${crypto.randomUUID()}@2?relay-protocol=irn&symKey=${key}`
}

/**
 * Show what each leg cost, and refuse to call the payment done.
 *
 * The interesting number here is not the total. It is that the wait for a
 * block dwarfs everything the SDK controls — which is the argument for not
 * optimising the parts we own for speed, and for never quoting the fast leg as
 * if it were the journey.
 *
 * `end-to-end` stays unknown on purpose. This demo has no settlement leg, so
 * there is no honest figure to print, and printing the chain leg's duration
 * under that label is the exact substitution being avoided.
 */
function PaymentTimelineEvidence({ timeline }: { timeline: PaymentTimeline }) {
  const display = describeTimeline(timeline)
  const total = endToEnd(timeline)
  return (
    <>
      <span data-testid="payment-timeline-state">
        state: {display.state} — {display.detail}
      </span>
      {timelineLegs(timeline).map((leg) => (
        <span key={`${leg.from}-${leg.to}`}>
          {leg.from} → {leg.to}:{' '}
          {leg.duration.known ? `${leg.duration.ms} ms` : `unknown (${leg.duration.reason})`}
          {leg.skipped.length > 0 ? ` · skipped ${leg.skipped.join(', ')}` : ''}
        </span>
      ))}
      <span data-testid="payment-timeline-total">
        end-to-end:{' '}
        {total.known ? `${total.ms} ms` : `unknown — ${total.reason}`}
      </span>
    </>
  )
}

function shortAddress(address: string | null): string {
  if (!address) return '—'
  const raw = address.includes(':') ? address.split(':').pop() ?? address : address
  return raw.length > 12 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw
}

function AppKitDemoPage() {
  return (
    <AppKit
      projectId="naculus-local-appkit-demo"
      metadata={{
        name: 'Naculus AppKit demo',
        description: 'Local AppKit interaction harness',
        url: 'http://localhost:3000/appkit',
        icons: [],
      }}
      enableEmbedded
      chains={SEPOLIA_CHAINS}
      embeddedConfig={{
        chainId: SEPOLIA_CAIP2,
        rpcUrl: SEPOLIA_RPC_URL,
        storageKey: LIVE_WALLET_STORAGE_KEY,
        autoSimulate: true,
      }}
      detectionMode="eip6963"
      defaultDark={false}
    >
      <AppKitDemoInner />
    </AppKit>
  )
}

function AppKitDemoInner() {
  useDemoInjectedWallet()
  const appkit = useAppKit()
  const wallet = useWallet()
  const account = useAccount()
  const balance = useBalance({ refreshInterval: 15_000 })
  const embedded = useEmbeddedWallet()
  const transaction = useSendTransaction()
  const zeroDevAdapter = useMemo(
    () => ZERO_DEV_CONFIGURATION.rpcUrl
      ? createZeroDev7702Adapter({ rpcUrl: ZERO_DEV_CONFIGURATION.rpcUrl })
      : undefined,
    [],
  )
  const policy = useDelegationPolicy({
    managerConfig: POLICY_MANAGER_CONFIG,
    adapter: zeroDevAdapter,
  })
  const [importValue, setImportValue] = useState('')
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey'>('mnemonic')
  const [notice, setNotice] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<'pending' | 'scanned' | 'error'>('pending')
  const [backupOpen, setBackupOpen] = useState(false)
  const [backupSeedPhrase, setBackupSeedPhrase] = useState<string | null>(null)
  const [persistedWalletAddress, setPersistedWalletAddress] = useState<string | null>(null)
  const [persistenceProbeComplete, setPersistenceProbeComplete] = useState(false)
  const [liveTestRunning, setLiveTestRunning] = useState(false)
  const [liveEvidence, setLiveEvidence] = useState<LiveTransactionEvidence | null>(null)
  const [policyPreview, setPolicyPreview] = useState<DelegationPolicyPreview | null>(null)
  const [zeroDevRunning, setZeroDevRunning] = useState<'setup' | 'execute' | null>(null)
  const [zeroDevSetupEvidence, setZeroDevSetupEvidence] = useState<ZeroDevUserOperationEvidence | null>(null)
  const [zeroDevExecutionEvidence, setZeroDevExecutionEvidence] = useState<ZeroDevUserOperationEvidence | null>(null)
  const [approvalRevision, setApprovalRevision] = useState(0)

  const installedApprovalIds = useMemo(() => {
    const installed = new Set<string>()
    if (typeof window === 'undefined' || !embedded.address) return installed
    for (const activePolicy of policy.activePolicies) {
      try {
        if (loadZeroDev7702Approval(embedded.address, activePolicy.id)) {
          installed.add(activePolicy.id)
        }
      } catch {
        // A malformed record is intentionally treated as absent. The adapter
        // will surface the exact fail-closed reason during preview/execution.
      }
    }
    return installed
  }, [approvalRevision, embedded.address, policy.activePolicies])

  useEffect(() => {
    let cancelled = false
    void probePersistedWalletAddress()
      .then((address) => {
        if (!cancelled) setPersistedWalletAddress(address)
      })
      .finally(() => {
        if (!cancelled) setPersistenceProbeComplete(true)
      })
    return () => {
      cancelled = true
    }
  }, [embedded.address])

  useEffect(() => {
    setLiveEvidence(null)
    setZeroDevSetupEvidence(null)
    setZeroDevExecutionEvidence(null)
    delete (window as Window & { __NACULUS_LIVE_TX__?: LiveTransactionEvidence })
      .__NACULUS_LIVE_TX__
    delete (window as Window & { __SENDERPAY_7702_LIVE__?: ZeroDevUserOperationEvidence })
      .__SENDERPAY_7702_LIVE__
  }, [embedded.address, wallet.chainId])

  useEffect(() => {
    if (embedded.error) {
      setNotice(embedded.error.message)
    } else if (wallet.isConnected && wallet.session?.walletType === 'embedded') {
      setNotice('嵌入式錢包已連線。')
    } else if (!wallet.isConnected) {
      setNotice((current) => current === '嵌入式錢包已連線。' ? null : current)
    }
  }, [embedded.error, wallet.isConnected, wallet.session?.walletType])

  const securityLabel = useMemo(() => {
    if (embedded.storageSecurityLevel <= 2) return 'IndexedDB 儲存（本機來源隔離）'
    if (embedded.storageSecurityLevel === 3) return 'localStorage + 加密（降級）'
    return '不安全 localStorage（僅供測試）'
  }, [embedded.storageSecurityLevel])

  async function handleCreateWallet() {
    const created = await embedded.generateWallet()
    if (created) {
      setBackupSeedPhrase(created.mnemonic ?? null)
      setBackupOpen(Boolean(created.mnemonic))
      setNotice('新錢包已建立。請先完成 seed phrase 備份，再連線使用。')
    }
  }

  async function handleImportWallet() {
    const value = importValue.trim()
    if (!value) {
      setNotice('請輸入 mnemonic 或 0x private key。')
      return
    }

    const imported = importMode === 'mnemonic'
      ? await embedded.importFromMnemonic(value)
      : await embedded.importFromPrivateKey(value as `0x${string}`)
    if (imported) {
      setNotice('錢包已匯入並保留在本機；接著可按「連線嵌入式錢包」。')
      setImportValue('')
    }
  }

  async function handleConnectEmbedded() {
    setNotice('嵌入式錢包連線中…')
    await embedded.connectEmbedded()
  }

  async function handleRestoreEmbedded() {
    setNotice('正在從 IndexedDB 恢復嵌入式錢包…')
    const restored = await embedded.restoreWallet()
    setNotice(restored ? '已從 IndexedDB 恢復嵌入式錢包。' : 'IndexedDB 記錄存在，但 SDK 尚未能恢復錢包。')
  }

  async function handleWipe() {
    const wasEmbedded = wallet.session?.walletType === 'embedded'
    try {
      await embedded.wipe()
      if (wasEmbedded) await appkit.disconnect()
      setNotice('本機嵌入式錢包資料已清除。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '清除錢包失敗。')
    }
  }

  async function handleCopyAddress() {
    if (!embedded.address) return
    try {
      await navigator.clipboard.writeText(embedded.address)
      setNotice('Sepolia 測試地址已複製。')
    } catch {
      setNotice('瀏覽器不允許自動複製；請手動複製完整地址。')
    }
  }

  async function handleLiveSelfTransfer() {
    const address = embedded.address as `0x${string}` | null
    if (!address || wallet.session?.walletType !== 'embedded') {
      setNotice('請先建立並連線嵌入式錢包。')
      return
    }
    if (wallet.chainId !== SEPOLIA_CAIP2) {
      setNotice('拒絕送出：目前 session 不是 Sepolia。')
      return
    }

    setLiveTestRunning(true)
    setLiveEvidence(null)
    delete (window as Window & { __NACULUS_LIVE_TX__?: LiveTransactionEvidence })
      .__NACULUS_LIVE_TX__
    transaction.reset()
    try {
      setNotice('正在讀取 Sepolia 送出前餘額與 nonce…')
      const [beforeBalanceHex, beforeNonceHex] = await Promise.all([
        sepoliaRpc<`0x${string}`>('eth_getBalance', [address, 'latest']),
        sepoliaRpc<`0x${string}`>('eth_getTransactionCount', [address, 'latest']),
      ])
      const beforeBalance = BigInt(beforeBalanceHex)
      const beforeNonce = Number(BigInt(beforeNonceHex))
      if (beforeBalance === 0n) {
        throw new Error('此 embedded wallet 的 Sepolia 餘額仍為 0；請先轉入測試 ETH。')
      }

      setNotice('正在用 embedded wallet 簽署並廣播 1 wei 自轉帳…')
      const hash = await transaction.sendTransaction({
        to: address,
        value: '0x1',
        chainId: SEPOLIA_CHAIN_ID,
      }) as `0x${string}`

      setNotice(`已廣播 ${hash.slice(0, 12)}…，等待 2 個 confirmations…`)
      const { receipt, confirmations } = await waitForSepoliaReceipt(hash)
      if (receipt.status !== '0x1') {
        throw new Error(`交易已上鏈但執行失敗，receipt status=${receipt.status}`)
      }
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
        throw new Error('Receipt transaction hash does not match the submitted hash')
      }

      const [chainTx, afterBalanceHex, afterNonceHex] = await Promise.all([
        sepoliaRpc<SepoliaTransaction | null>('eth_getTransactionByHash', [hash]),
        sepoliaRpc<`0x${string}`>('eth_getBalance', [address, 'latest']),
        sepoliaRpc<`0x${string}`>('eth_getTransactionCount', [address, 'latest']),
      ])
      if (!chainTx) throw new Error('Receipt exists but eth_getTransactionByHash returned null')
      const from = chainTx.from.toLowerCase()
      const to = chainTx.to?.toLowerCase()
      if (chainTx.hash.toLowerCase() !== hash.toLowerCase()) {
        throw new Error('RPC transaction hash does not match the submitted hash')
      }
      if (from !== address.toLowerCase() || to !== address.toLowerCase()) {
        throw new Error('On-chain from/to does not match the embedded wallet self-transfer')
      }
      if (BigInt(chainTx.value) !== 1n) {
        throw new Error(`On-chain value mismatch: expected 1 wei, got ${BigInt(chainTx.value)} wei`)
      }

      const afterBalance = BigInt(afterBalanceHex)
      const afterNonce = Number(BigInt(afterNonceHex))
      const gasUsed = BigInt(receipt.gasUsed)
      const effectiveGasPrice = BigInt(receipt.effectiveGasPrice)
      const receiptGasCost = gasUsed * effectiveGasPrice
      if (afterNonce !== beforeNonce + 1) {
        throw new Error(`Nonce did not advance exactly once (${beforeNonce} → ${afterNonce})`)
      }
      if (beforeBalance - afterBalance !== receiptGasCost) {
        throw new Error(
          `Balance delta does not equal receipt gas cost (${beforeBalance - afterBalance} !== ${receiptGasCost})`,
        )
      }

      const evidence: LiveTransactionEvidence = {
        hash,
        receiptStatus: 'success',
        blockNumber: Number(BigInt(receipt.blockNumber)),
        confirmations,
        from: chainTx.from,
        to: chainTx.to!,
        valueWei: BigInt(chainTx.value).toString(),
        beforeBalanceWei: beforeBalance.toString(),
        afterBalanceWei: afterBalance.toString(),
        gasCostWei: receiptGasCost.toString(),
        gasUsed: gasUsed.toString(),
        effectiveGasPriceWei: effectiveGasPrice.toString(),
        beforeNonce,
        afterNonce,
        verifiedAt: new Date().toISOString(),
      }
      setLiveEvidence(evidence)
      ;(window as Window & { __NACULUS_LIVE_TX__?: LiveTransactionEvidence }).__NACULUS_LIVE_TX__ = evidence
      await balance.refetch()
      setNotice('Sepolia 真實交易已完成：receipt、2 confirmations、地址、value、nonce 與 balance delta 全部驗證通過。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sepolia 實送驗證失敗。')
    } finally {
      setLiveTestRunning(false)
    }
  }

  async function handleCreatePolicy() {
    const address = embedded.address as `0x${string}` | null
    if (!address || wallet.session?.walletType !== 'embedded') {
      setNotice('請先連線嵌入式 EVM 錢包，再建立 policy。')
      return
    }
    try {
      setPolicyPreview(null)
      setNotice('請在目前錢包簽署 30 分鐘、5 次、Sepolia-only 的本機 policy…')
      const created = await policy.createPolicy({
        mode: 'offchain',
        expiry: Math.floor(Date.now() / 1000) + 30 * 60,
        maxTotalValue: 10_000_000_000_000_000n,
        maxValuePerTx: 1_000_000_000_000_000n,
        maxTxCount: 5,
        allowedContracts: [SENDERPAY_TEST_RECIPIENT],
        allowedChainIds: [SEPOLIA_CHAIN_ID],
      })
      setNotice(`Policy ${created.id.slice(0, 8)}… 已由主錢包簽署並持久化。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '建立 policy 失敗。')
    }
  }

  function oneWeiPolicyTransaction() {
    return {
      to: SENDERPAY_TEST_RECIPIENT,
      value: '1',
      data: '0x' as const,
      chainId: SEPOLIA_CHAIN_ID,
    }
  }

  async function handleInitializeZeroDevPermission(activePolicy: typeof policy.activePolicies[number]) {
    const rpcUrl = ZERO_DEV_CONFIGURATION.rpcUrl
    const address = embedded.address as `0x${string}` | null
    if (!rpcUrl) {
      // This check deliberately precedes getPrivateKey().
      setNotice(ZERO_DEV_CONFIGURATION.error)
      return
    }
    if (!address || wallet.session?.walletType !== 'embedded') {
      setNotice('請先連線嵌入式 EVM 錢包，再初始化 7702 permission。')
      return
    }
    setZeroDevRunning('setup')
    setZeroDevSetupEvidence(null)
    setZeroDevExecutionEvidence(null)
    try {
      setNotice('先驗證 ZeroDev endpoint 的 Sepolia chain ID 與 EntryPoint；此步驟不讀取 owner key…')
      await verifyZeroDevSepoliaRpc(rpcUrl)
      const ownerPrivateKey = embedded.getPrivateKey()
      if (!ownerPrivateKey) throw new Error('無法從已連線的 embedded wallet 取得 owner key。')
      const requestedTransaction = oneWeiPolicyTransaction()
      setNotice('請確認 owner 授權：將在 Sepolia 安裝 30 分鐘、最多 5 次、單次上限 0.001 ETH 的 bounded permission…')
      const result = await initializeZeroDev7702Permission({
        rpcUrl,
        ownerPrivateKey,
        policy: activePolicy,
        transaction: requestedTransaction,
        signDigest: (digest, authoritativeTransaction) => policy.signPolicyDigest(
          activePolicy.id,
          digest,
          authoritativeTransaction,
        ),
      })
      setZeroDevSetupEvidence(result.evidence)
      setApprovalRevision((revision) => revision + 1)
      await Promise.all([policy.refresh(), policy.delegation.refetch()])
      setNotice('Owner-approved setup 已上鏈，Kernel delegation 與 bounded permission 都已讀回驗證。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ZeroDev 7702 permission 初始化失敗。')
    } finally {
      setZeroDevRunning(null)
    }
  }

  async function handleExecuteZeroDevPayment(activePolicy: typeof policy.activePolicies[number]) {
    const rpcUrl = ZERO_DEV_CONFIGURATION.rpcUrl
    const address = embedded.address as `0x${string}` | null
    if (!rpcUrl) {
      setNotice(ZERO_DEV_CONFIGURATION.error)
      return
    }
    if (!address || wallet.session?.walletType !== 'embedded') {
      setNotice('請先連線已完成 permission setup 的 embedded wallet。')
      return
    }
    setZeroDevRunning('execute')
    setZeroDevExecutionEvidence(null)
    try {
      const requestedTransaction = oneWeiPolicyTransaction()
      setNotice('正在用 Naculus session key 準備、簽署並廣播 sponsored UserOperation；不會再次讀取 owner private key…')
      // Stamped after executePolicy resolves rather than before, so the time
      // spent preparing and signing lands on the leg that actually spent it.
      let timeline = recordStage(
        startTimeline(),
        'authorized',
        `session key for policy ${activePolicy.id}`,
        Date.now(),
      )
      const submission = await policy.executePolicy(activePolicy.id, requestedTransaction)
      timeline = recordStage(
        timeline,
        'submitted',
        `UserOperation ${submission.hash} accepted by the bundler`,
        Date.now(),
      )
      const evidence = await waitForZeroDevUserOperation(
        rpcUrl,
        submission.hash,
        address,
        2,
        timeline,
      )
      setZeroDevExecutionEvidence(evidence)
      ;(window as Window & { __SENDERPAY_7702_LIVE__?: ZeroDevUserOperationEvidence })
        .__SENDERPAY_7702_LIVE__ = evidence
      // Not "已完成". Two confirmations prove a chain accepted the transaction;
      // they say nothing about whether a recipient can spend anything, and
      // this demo has no settlement leg to ask. describeTimeline is the source
      // of the wording so this string cannot drift away from what was proven.
      setNotice(
        `無提示 session-key UserOperation ${describeTimeline(evidence.timeline).detail}` +
          '：UserOp receipt、公開交易 hash 與 2 confirmations 全部驗證通過。',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ZeroDev session-key 支付失敗。')
    } finally {
      setZeroDevRunning(null)
    }
  }

  async function handlePreviewPolicy(policyId: string) {
    if (!embedded.address) return
    try {
      const preview = await policy.previewPolicyExecution(
        policyId,
        oneWeiPolicyTransaction(),
        1,
        'preferred',
      )
      setPolicyPreview(preview)
      setNotice(preview.ready ? 'Policy 與 execution preview 均通過。' : preview.reason)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Policy preview 失敗。')
    }
  }

  async function handleRevokePolicy(activePolicy: typeof policy.activePolicies[number]) {
    // On chain first. Revoking locally and failing on chain is the outcome
    // this exists to remove: the interface says the authorization is gone
    // while the permission is still installed and the session key still works.
    let onchain: string | null = null
    let onchainError: string | null = null
    try {
      const ownerPrivateKey = embedded.getPrivateKey()
      if (!ownerPrivateKey) throw new Error('無法從已連線的 embedded wallet 取得 owner key。')
      if (!ZERO_DEV_CONFIGURATION.rpcUrl) {
        throw new Error(ZERO_DEV_CONFIGURATION.error ?? 'VITE_ZERODEV_RPC 未設定。')
      }
      const evidence = await revokeZeroDev7702Permission({
        rpcUrl: ZERO_DEV_CONFIGURATION.rpcUrl,
        ownerPrivateKey,
        policy: activePolicy,
      })
      onchain = evidence.transactionHash
    } catch (error) {
      onchainError = error instanceof Error ? error.message : 'on-chain uninstall 失敗。'
    }

    try {
      // Always worth doing: it stops this application signing, whether or not
      // the chain was reached. The stored approval is deliberately left in
      // place when the uninstall failed -- it is what a retry needs to target
      // the right plugin, and clearing it would strand the permission.
      await policy.revokePolicy(activePolicy.id)
      setApprovalRevision((revision) => revision + 1)
      setPolicyPreview(null)
      setNotice(
        onchain
          ? `Policy 已撤銷：鏈上 permission 已 uninstall（tx ${onchain}），本機 session key 也已失效。`
          : `Policy 已在本機撤銷，後續 Naculus session-key 簽署會被拒絕。鏈上 permission 仍然安裝著，未被移除 —— ${onchainError} 請在設定好 RPC 後重試撤銷。`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '撤銷 policy 失敗。')
    }
  }

  function openQr() {
    setQrUri(makeDemoWalletConnectUri())
    setQrStatus('pending')
    setQrOpen(true)
  }

  return (
    <main className="demo-page demo-page-wide">
      <section className="demo-panel appkit-hero">
        <div>
          <p className="island-kicker">Own AppKit · local interaction demo</p>
          <h1 className="demo-title">Connect once. Keep control.</h1>
          <p className="demo-muted appkit-lede">
            這個頁面直接使用 Naculus AppKit、Connect Lib 與本地 deterministic wallet，展示公開 SDK 的連線、嵌入式錢包與 WalletConnect QR UX。
          </p>
        </div>
        <div className="appkit-connect-zone" data-testid="appkit-connect-zone">
          <AppKitButton className="appkit-demo-button" />
          <span className="demo-pill" data-testid="connection-status">
            {wallet.isConnecting ? '連線中…' : wallet.isConnected ? '已連線' : '尚未連線'}
          </span>
        </div>
      </section>

      <section className="appkit-grid">
        <article className="demo-card appkit-card">
          <div className="appkit-card-heading">
            <div>
              <p className="island-kicker">Embedded wallet</p>
              <h2 className="demo-section-title">建立或匯入自管錢包</h2>
            </div>
            <span className="demo-pill">{securityLabel}</span>
          </div>
          <p className="demo-muted appkit-small-copy">
            私鑰只在瀏覽器錢包引擎內使用；此 demo 不會把 seed phrase 或 private key 傳送到網路。
          </p>
          <p className="demo-muted appkit-small-copy" data-testid="embedded-persistence-probe">
            IndexedDB record: {persistenceProbeComplete ? persistedWalletAddress ?? 'missing' : 'checking…'}
          </p>
          <div className="appkit-actions">
            <button className="demo-button" type="button" onClick={handleCreateWallet} disabled={embedded.isBusy} data-testid="create-wallet">
              {embedded.isBusy ? '處理中…' : '建立新錢包'}
            </button>
            {embedded.hasWallet && (
              <button className="demo-button demo-button-secondary" type="button" onClick={handleConnectEmbedded} disabled={embedded.isBusy} data-testid="connect-embedded">
                連線嵌入式錢包
              </button>
            )}
            {!embedded.hasWallet && persistedWalletAddress && (
              <button className="demo-button demo-button-secondary" type="button" onClick={handleRestoreEmbedded} disabled={embedded.isBusy} data-testid="restore-embedded">
                恢復本機錢包
              </button>
            )}
          </div>
          <div className="appkit-import-row">
            <select className="demo-select" value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)} aria-label="Import type">
              <option value="mnemonic">Mnemonic</option>
              <option value="privateKey">Private key</option>
            </select>
            <input
              className="demo-input"
              type="password"
              value={importValue}
              onChange={(event) => setImportValue(event.target.value)}
              placeholder={importMode === 'mnemonic' ? '輸入 12/24 words mnemonic' : '輸入 0x private key'}
              aria-label={importMode === 'mnemonic' ? 'Mnemonic' : 'Private key'}
              autoComplete="off"
            />
            <button className="demo-button demo-button-secondary" type="button" onClick={handleImportWallet} disabled={embedded.isBusy} data-testid="import-wallet">
              匯入
            </button>
          </div>
          {embedded.wallet && (
            <div className="demo-code-block appkit-wallet-summary" data-testid="embedded-wallet-summary">
              <span className="demo-muted">完整 Sepolia 測試地址</span>
              <code data-testid="embedded-wallet-address" style={{ overflowWrap: 'anywhere' }}>{embedded.address}</code>
              <span className="demo-muted">安全等級 {embedded.storageSecurityLevel}/4</span>
              <button className="demo-button demo-button-secondary" type="button" onClick={handleCopyAddress}>
                複製地址
              </button>
            </div>
          )}
          {embedded.hasWallet && (
            <button className="demo-button demo-button-danger appkit-wipe" type="button" onClick={handleWipe} disabled={embedded.isBusy} data-testid="wipe-wallet">
              清除本機錢包
            </button>
          )}
        </article>

        <article className="demo-card appkit-card">
          <div className="appkit-card-heading">
            <div>
              <p className="island-kicker">WalletConnect</p>
              <h2 className="demo-section-title">QR pairing 預覽</h2>
            </div>
            <span className="demo-pill">CAIP-25 / v2</span>
          </div>
          <p className="demo-muted appkit-small-copy">
            這裡使用有效的 wc: URI 來驗證 QR、倒數、取消與重試 UX；實際 relay 連線需要正式 WalletConnect project ID 與外部錢包。
          </p>
          <button className="demo-button" type="button" onClick={openQr} data-testid="open-walletconnect-qr">
            顯示 WalletConnect QR Code
          </button>
          <div className="demo-alert">
            <strong>安全提示</strong>
            <span>只掃描你信任的來源；不要把 pairing URI 貼到公開聊天室。</span>
          </div>
        </article>
      </section>

      <section className="demo-panel appkit-status-panel">
        <div>
          <p className="island-kicker">Session status</p>
          <h2 className="demo-section-title">目前連線資訊</h2>
        </div>
        <dl className="appkit-status-grid">
          <div><dt>Wallet</dt><dd>{wallet.session?.walletType ?? '—'}</dd></div>
          <div><dt>Account</dt><dd>{shortAddress(account.primaryAccount)}</dd></div>
          <div><dt>Chain</dt><dd>{appkit.chainName ?? wallet.chainId ?? '—'}</dd></div>
          <div><dt>WalletConnect</dt><dd>本地 QR 模擬</dd></div>
        </dl>
        {wallet.isConnected && <AppKitChainSelector variant="buttons" className="appkit-chain-selector" />}
        {notice && <p className="demo-alert appkit-notice" role="status">{notice}</p>}
        {embedded.error && <p className="demo-alert demo-alert-danger appkit-notice" role="alert">{embedded.error.message}</p>}
      </section>

      <section className="demo-panel appkit-status-panel" data-testid="sepolia-live-test">
        <div>
          <p className="island-kicker">Funded public-chain verification</p>
          <h2 className="demo-section-title">Sepolia embedded wallet 真實實送</h2>
          <p className="demo-muted appkit-small-copy">
            先轉入 0.001 Sepolia ETH 到上方完整地址。按下後會在公開 Sepolia 用 embedded wallet 簽署並廣播 1 wei 自轉帳，且只有在 receipt status=1、至少 2 confirmations、鏈上 from/to/value、nonce 與餘額差全部吻合時才顯示成功。
          </p>
        </div>
        <dl className="appkit-status-grid">
          <div><dt>Network</dt><dd>{SEPOLIA_CAIP2}</dd></div>
          <div><dt>Balance</dt><dd>{balance.formatted ?? '—'} {balance.symbol ?? ''}</dd></div>
          <div><dt>Send state</dt><dd>{liveTestRunning ? '驗證中…' : transaction.status}</dd></div>
          <div><dt>Receipt</dt><dd>{liveEvidence?.receiptStatus ?? '尚未執行'}</dd></div>
        </dl>
        <div className="appkit-actions">
          <button
            className="demo-button demo-button-secondary"
            type="button"
            onClick={() => void balance.refetch()}
            disabled={balance.isLoading}
            data-testid="refresh-sepolia-balance"
          >
            {balance.isLoading ? '讀取中…' : '重新讀取鏈上餘額'}
          </button>
          <button
            className="demo-button"
            type="button"
            onClick={handleLiveSelfTransfer}
            disabled={liveTestRunning || wallet.session?.walletType !== 'embedded' || wallet.chainId !== SEPOLIA_CAIP2}
            data-testid="send-sepolia-live-transaction"
          >
            {liveTestRunning ? '等待鏈上確認…' : '廣播 1 wei 並驗證'}
          </button>
        </div>
        {liveEvidence && (
          <div className="demo-code-block" data-testid="sepolia-live-evidence">
            <span>txHash: <a href={`${SEPOLIA_EXPLORER_URL}/tx/${liveEvidence.hash}`} target="_blank" rel="noreferrer">{liveEvidence.hash}</a></span>
            <span>block: {liveEvidence.blockNumber} · confirmations: {liveEvidence.confirmations}</span>
            <span>value: {liveEvidence.valueWei} wei · gas cost: {liveEvidence.gasCostWei} wei</span>
            <span>gas used: {liveEvidence.gasUsed} · effective gas price: {liveEvidence.effectiveGasPriceWei} wei</span>
            <span>nonce: {liveEvidence.beforeNonce} → {liveEvidence.afterNonce}</span>
            <span>balance: {liveEvidence.beforeBalanceWei} → {liveEvidence.afterBalanceWei} wei</span>
          </div>
        )}
      </section>

      <section className="demo-panel appkit-status-panel" data-testid="delegation-policy-flow">
        <div>
          <p className="island-kicker">Authorization product flow</p>
          <h2 className="demo-section-title">Read delegation → owner setup → execution preview → promptless payment</h2>
          <p className="demo-muted appkit-small-copy">
            這裡先由 embedded owner 簽署 Sepolia-only policy，再透過 ZeroDev 將同一把 Naculus session key 的 bounded permission 安裝到 EIP-7702 Kernel。只有 setup receipt、鏈上 delegation、permission 與 paymaster preflight 都通過後，才開放後續不再讀取 owner key 的 session-key 支付。
          </p>
          <p className="demo-alert demo-alert-warning appkit-small-copy" data-testid="subscription-proof-boundary">
            證實範圍：單次支付與有限 permission 的後續執行。尚未證實 recurring subscription；排程、續扣、重試、dunning、商戶撤銷與通知仍是另一個產品階段。
          </p>
        </div>
        <dl className="appkit-status-grid">
          <div><dt>ZeroDev RPC</dt><dd data-testid="zerodev-config-status">{ZERO_DEV_CONFIGURATION.rpcUrl ? 'configured' : 'missing / invalid'}</dd></div>
          <div>
            <dt>On-chain delegation</dt>
            <dd data-testid="delegation-read-status">
              {policy.delegation.isFetching
                ? '讀取中…'
                : policy.delegation.delegated === null
                  ? 'unknown'
                  : policy.delegation.delegated
                    ? policy.delegation.delegate ?? 'delegated'
                    : 'none'}
            </dd>
          </div>
          <div><dt>Persistent storage</dt><dd>{policy.storageAvailable ? 'available' : 'unavailable'}</dd></div>
          <div><dt>Signed active policies</dt><dd data-testid="active-policy-count">{policy.activePolicies.length}</dd></div>
          <div><dt>On-chain permission</dt><dd>{installedApprovalIds.size > 0 ? 'stored setup evidence' : 'not initialized'}</dd></div>
          <div><dt>Preview route</dt><dd data-testid="policy-preview-route">{policyPreview?.execution.route ?? 'not run'}</dd></div>
        </dl>
        <div className="appkit-actions">
          <button
            className="demo-button"
            type="button"
            onClick={handleCreatePolicy}
            disabled={policy.isBusy || wallet.session?.walletType !== 'embedded'}
            data-testid="create-delegation-policy"
          >
            {policy.isBusy ? '處理中…' : '簽署並保存 policy'}
          </button>
          {policy.activePolicies.map((activePolicy) => (
            <span className="appkit-actions" key={activePolicy.id} data-testid="active-delegation-policy">
              <button
                className="demo-button"
                type="button"
                onClick={() => void handleInitializeZeroDevPermission(activePolicy)}
                disabled={policy.isBusy || zeroDevRunning !== null || installedApprovalIds.has(activePolicy.id)}
                data-testid="initialize-zerodev-permission"
              >
                {installedApprovalIds.has(activePolicy.id) ? '7702 permission 已初始化' : 'Owner 初始化 7702 permission'}
              </button>
              <button
                className="demo-button demo-button-secondary"
                type="button"
                onClick={() => void handlePreviewPolicy(activePolicy.id)}
                disabled={policy.isBusy}
              >
                Preview 1 wei
              </button>
              <button
                className="demo-button"
                type="button"
                onClick={() => void handleExecuteZeroDevPayment(activePolicy)}
                disabled={policy.isBusy || zeroDevRunning !== null || !installedApprovalIds.has(activePolicy.id)}
                data-testid="execute-zerodev-payment"
              >
                {zeroDevRunning === 'execute' ? '等待 UserOp receipt…' : 'Session key 無提示支付 1 wei'}
              </button>
              <button
                className="demo-button demo-button-danger"
                type="button"
                onClick={() => void handleRevokePolicy(activePolicy)}
                disabled={policy.isBusy}
              >
                Revoke {activePolicy.id.slice(0, 8)}…
              </button>
            </span>
          ))}
        </div>
        {policyPreview && (
          <div className="demo-code-block appkit-preview-details" data-testid="delegation-policy-preview">
            <span>ready: {String(policyPreview.ready)}</span>
            <span>broadcast ready: {String(policyPreview.broadcastReady)}</span>
            <span>broadcast route: {policyPreview.broadcastRoute ?? 'not configured'}</span>
            <span>on-chain policy installed: {String(policyPreview.onchainAuthorizationVerified)}</span>
            <span>broadcast gas sponsored: {policyPreview.broadcastSponsored === null ? 'unknown' : String(policyPreview.broadcastSponsored)}</span>
            <span>promptless: {String(policyPreview.broadcastPromptless)}</span>
            <span>authorized: {String(policyPreview.policy?.authorized ?? false)}</span>
            <span>authorization verified: {String(policyPreview.authorizationVerified)}</span>
            <span>signer matches: {String(policyPreview.signerMatches)}</span>
            <span>scope: {policyPreview.scope.valid ? 'allowed' : 'refused'}</span>
            <span>route: {policyPreview.execution.route ?? 'refused'} · atomic: {String(policyPreview.execution.atomic)}</span>
            <span>gas payer guaranteed sponsored: {String(policyPreview.execution.sponsored)}</span>
            <span>{policyPreview.reason}</span>
          </div>
        )}
        {!ZERO_DEV_CONFIGURATION.rpcUrl && (
          <p className="demo-alert demo-alert-danger" role="alert" data-testid="zerodev-config-error">
            {ZERO_DEV_CONFIGURATION.error} 請把真實 endpoint 放在本機 .env.local；未設定時不會要求 owner key、簽名或廣播。
          </p>
        )}
        {zeroDevSetupEvidence && (
          <div className="demo-code-block" data-testid="zerodev-setup-evidence">
            <span>setup userOp: <a href={`${SEPOLIA_EXPLORER_URL}/tx/${zeroDevSetupEvidence.transactionHash}`} target="_blank" rel="noreferrer">{zeroDevSetupEvidence.userOperationHash}</a></span>
            <span>public tx: {zeroDevSetupEvidence.transactionHash}</span>
            <span>block: {zeroDevSetupEvidence.blockNumber} · confirmations: {zeroDevSetupEvidence.confirmations}</span>
            <span>sender: {zeroDevSetupEvidence.sender} · success: {String(zeroDevSetupEvidence.success)}</span>
          </div>
        )}
        {zeroDevExecutionEvidence && (
          <div className="demo-code-block" data-testid="zerodev-execution-evidence">
            <span>promptless userOp: {zeroDevExecutionEvidence.userOperationHash}</span>
            <span>public tx: <a href={`${SEPOLIA_EXPLORER_URL}/tx/${zeroDevExecutionEvidence.transactionHash}`} target="_blank" rel="noreferrer">{zeroDevExecutionEvidence.transactionHash}</a></span>
            <span>block: {zeroDevExecutionEvidence.blockNumber} · confirmations: {zeroDevExecutionEvidence.confirmations}</span>
            <span>gas used: {zeroDevExecutionEvidence.actualGasUsed} · gas cost: {zeroDevExecutionEvidence.actualGasCostWei} wei</span>
            <PaymentTimelineEvidence timeline={zeroDevExecutionEvidence.timeline} />
          </div>
        )}
        {policy.error && <p className="demo-alert demo-alert-danger" role="alert">{policy.error.message}</p>}
        <p className="demo-muted appkit-small-copy">
          Tester 的固定 encryption key 只用來驗證 reload persistence，不是 production custody。正式產品必須由登入後的 host key、PRF 或等價安全邊界提供 encryptionKey。
        </p>
      </section>

      <QRCodeModal
        uri={qrUri}
        open={qrOpen}
        status={qrStatus}
        onClose={() => setQrOpen(false)}
        onRetry={openQr}
        title="Scan with WalletConnect"
        description="本地 demo pairing URI；正式環境請由 WalletConnect relay 產生。"
      />
      {backupOpen && embedded.backupPending && backupSeedPhrase && (
        <SeedPhraseBackup
          seedPhrase={backupSeedPhrase}
          onConfirm={() => {
            embedded.confirmBackup()
            setBackupSeedPhrase(null)
            setBackupOpen(false)
          }}
          onSkip={() => {
            embedded.confirmBackup()
            setBackupSeedPhrase(null)
            setBackupOpen(false)
          }}
          onOpenChange={setBackupOpen}
        />
      )}
    </main>
  )
}
