import type {
  PolicyExecutionAdapter,
  PolicyExecutionCheck,
} from '@naculus/connect-appkit-react'
import type {
  PaymentTimeline,
  SessionKeyInfo,
  SessionKeyTransaction,
} from '@naculus/connect-core'
import { readDelegation, recordStage, startTimeline } from '@naculus/connect-core'
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  constants,
  uninstallPlugin,
} from '@zerodev/sdk'
import {
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from '@zerodev/permissions'
import {
  CallPolicyVersion,
  toCallPolicy,
  toRateLimitPolicy,
  toTimestampPolicy,
} from '@zerodev/permissions/policies'
import { toECDSASigner } from '@zerodev/permissions/signers'
import {
  type Address,
  type Hex,
  createPublicClient,
  hashMessage,
  http,
  isAddress,
  isAddressEqual,
} from 'viem'
import {
  type PrepareUserOperationReturnType,
  type UserOperation,
  createBundlerClient,
  getUserOperationHash,
} from 'viem/account-abstraction'
import {
  privateKeyToAccount,
  publicKeyToAddress,
  toAccount,
} from 'viem/accounts'
import { sepolia } from 'viem/chains'

export const ZERODEV_SEPOLIA_CHAIN_ID = 11155111
export const ZERODEV_APPROVAL_STORAGE_PREFIX = 'senderpay_zerodev_7702_v1'

/** Product-claim boundary for this proof. */
export const SENDERPAY_7702_PROOF_SCOPE = Object.freeze({
  boundedPayment: true,
  ownerApprovedPermissionSetup: true,
  promptlessSessionExecution: true,
  recurringSubscription: false,
  /**
   * This path observes a chain, and a chain's last word is `confirmed`.
   * Nothing here can see the recipient's side, so no timeline it produces ever
   * reaches `settled` and nothing built on it may render a payment as done.
   * Whoever moves the last mile records that stage.
   */
  settlementObserved: false,
})

const ENTRY_POINT = constants.getEntryPoint('0.7')
const KERNEL_VERSION = constants.KERNEL_V3_3
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/

export interface ZeroDev7702ApprovalRecord {
  version: 1
  chainId: typeof ZERODEV_SEPOLIA_CHAIN_ID
  ownerAddress: Address
  policyId: string
  sessionAddress: Address
  smartAccountAddress: Address
  executorAddress: Address
  serializedPermissionAccount: string
  installedAt: string
  setupUserOperationHash: Hex
  setupTransactionHash: Hex
}

export interface ZeroDevUserOperationEvidence {
  userOperationHash: Hex
  transactionHash: Hex
  sender: Address
  success: true
  blockNumber: number
  confirmations: number
  actualGasCostWei: string
  actualGasUsed: string
  verifiedAt: string
  /**
   * When each stage happened, not just that it did.
   *
   * `verifiedAt` above is one timestamp at the end, which can say the whole
   * thing took N seconds but never which part of it did. The timeline carries
   * a timestamp per stage, so a slow leg is visible instead of averaged into
   * the total.
   *
   * This path can only ever fill `authorized` through `confirmed`. `settled`
   * belongs to whoever moves the money the last mile, and its absence here is
   * the honest answer rather than a gap to paper over: a confirmed
   * UserOperation proves a chain accepted a transaction, not that a recipient
   * can spend anything.
   */
  timeline: PaymentTimeline
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type SignatureSlot = {
  signer: Awaited<ReturnType<typeof toECDSASigner>>
  arm: (expectedUserOperationHash: Hex, signature: Hex) => void
}

type PreparedRuntime = {
  account: Awaited<ReturnType<typeof deserializePermissionAccount>>
  bundlerClient: ReturnType<typeof createBundlerClient>
  publicClient: ReturnType<typeof createPublicClient>
  signatureSlot: SignatureSlot
  userOperation: PrepareUserOperationReturnType
  userOperationHash: Hex
  sponsored: boolean
}

type AdapterPayload = PreparedRuntime & {
  kind: 'senderpay-zerodev-7702-v1'
  policyId: string
  transaction: SessionKeyTransaction
}

function browserStorage(): StorageLike {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('ZeroDev approval storage is unavailable outside the browser.')
  }
  return window.localStorage
}

function normalizeAddress(value: string, label: string): Address {
  if (!isAddress(value, { strict: false })) throw new Error(`${label} is not a valid EVM address.`)
  return value as Address
}

function normalizeHash(value: string, label: string): Hex {
  if (!HASH_PATTERN.test(value)) throw new Error(`${label} is not a 32-byte hash.`)
  return value as Hex
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/** Validate configuration before any owner key is requested or any RPC is sent. */
export function parseZeroDevRpcUrl(value: string | undefined): string {
  const candidate = value?.trim()
  if (!candidate) {
    throw new Error('VITE_ZERODEV_RPC is missing. Configure a Sepolia ZeroDev bundler/paymaster endpoint before setup or broadcast.')
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('VITE_ZERODEV_RPC must be an absolute URL.')
  }
  if (url.username || url.password || url.hash) {
    throw new Error('VITE_ZERODEV_RPC must not contain URL credentials or a fragment.')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('VITE_ZERODEV_RPC must use HTTPS (HTTP is allowed only for a loopback self-hosted service).')
  }
  return url.toString()
}

export function readZeroDevRpcUrl(value?: string): string {
  const viteEnv = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>
  }).env
  return parseZeroDevRpcUrl(value ?? viteEnv?.VITE_ZERODEV_RPC)
}

/**
 * ZeroDev's ECDSA permission signer validates an EIP-191 `signMessage` over
 * the UserOperation hash. Naculus signs an exact 32-byte digest, so the bridge
 * must give it this hashMessage result rather than the unhashed UserOp hash.
 */
export function zeroDevSessionDigest(userOperationHash: Hex): Hex {
  return hashMessage({ raw: normalizeHash(userOperationHash, 'UserOperation hash') })
}

export function zeroDevApprovalStorageKey(ownerAddress: string, policyId: string): string {
  return `${ZERODEV_APPROVAL_STORAGE_PREFIX}:${ownerAddress.toLowerCase()}:${policyId}`
}

function parseApprovalRecord(raw: string): ZeroDev7702ApprovalRecord {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Stored ZeroDev approval is not valid JSON.')
  }
  if (!value || typeof value !== 'object') {
    throw new Error('Stored ZeroDev approval has an invalid shape.')
  }
  const record = value as Partial<ZeroDev7702ApprovalRecord>
  if (
    record.version !== 1 ||
    record.chainId !== ZERODEV_SEPOLIA_CHAIN_ID ||
    typeof record.policyId !== 'string' ||
    !record.policyId ||
    typeof record.serializedPermissionAccount !== 'string' ||
    !record.serializedPermissionAccount ||
    typeof record.installedAt !== 'string'
  ) {
    throw new Error('Stored ZeroDev approval is incomplete or uses an unsupported version.')
  }
  return {
    version: 1,
    chainId: ZERODEV_SEPOLIA_CHAIN_ID,
    ownerAddress: normalizeAddress(record.ownerAddress ?? '', 'Stored owner address'),
    policyId: record.policyId,
    sessionAddress: normalizeAddress(record.sessionAddress ?? '', 'Stored session address'),
    smartAccountAddress: normalizeAddress(record.smartAccountAddress ?? '', 'Stored smart-account address'),
    executorAddress: normalizeAddress(record.executorAddress ?? '', 'Stored executor address'),
    serializedPermissionAccount: record.serializedPermissionAccount,
    installedAt: record.installedAt,
    setupUserOperationHash: normalizeHash(record.setupUserOperationHash ?? '', 'Stored setup UserOperation hash'),
    setupTransactionHash: normalizeHash(record.setupTransactionHash ?? '', 'Stored setup transaction hash'),
  }
}

export function loadZeroDev7702Approval(
  ownerAddress: string,
  policyId: string,
  storage: StorageLike = browserStorage(),
): ZeroDev7702ApprovalRecord | null {
  const raw = storage.getItem(zeroDevApprovalStorageKey(ownerAddress, policyId))
  if (!raw) return null
  const record = parseApprovalRecord(raw)
  if (!isAddressEqual(record.ownerAddress, normalizeAddress(ownerAddress, 'Owner address')) || record.policyId !== policyId) {
    throw new Error('Stored ZeroDev approval is bound to a different owner or policy.')
  }
  return record
}

export function saveZeroDev7702Approval(
  record: ZeroDev7702ApprovalRecord,
  storage: StorageLike = browserStorage(),
): void {
  const validated = parseApprovalRecord(JSON.stringify(record))
  storage.setItem(
    zeroDevApprovalStorageKey(validated.ownerAddress, validated.policyId),
    JSON.stringify(validated),
  )
}

export function removeZeroDev7702Approval(
  ownerAddress: string,
  policyId: string,
  storage: StorageLike = browserStorage(),
): void {
  storage.removeItem(zeroDevApprovalStorageKey(ownerAddress, policyId))
}

/**
 * The parts of a policy that define the on-chain permission's identity.
 *
 * Split from the liveness check because revocation needs this and must not
 * need that: a policy revoked locally still has its permission installed on
 * chain, and that is precisely the case a user needs to be able to clear.
 * Requiring `status === "active"` here would have made the dangerous state
 * the one state that could not be undone.
 */
function assertPolicyShape(policy: SessionKeyInfo): void {
  if (policy.scope.mode !== 'offchain') {
    throw new Error('The Naculus policy is not an off-chain policy.')
  }
  if (!policy.scope.allowedChainIds?.includes(ZERODEV_SEPOLIA_CHAIN_ID)) {
    throw new Error('The Naculus policy is not restricted to Sepolia.')
  }
  if (!policy.scope.allowedContracts?.length) {
    throw new Error('The Naculus policy must restrict allowed payment targets.')
  }
  if (!policy.scope.maxTxCount || policy.scope.maxTxCount < 1) {
    throw new Error('The Naculus policy must have a finite transaction count.')
  }
  if (!policy.scope.maxValuePerTx || policy.scope.maxValuePerTx < 1n) {
    throw new Error('The Naculus policy must have a positive finite per-transaction value limit.')
  }
  if (!policy.scope.maxTotalValue || policy.scope.maxTotalValue < 1n) {
    throw new Error('The Naculus policy must have a positive finite total value limit.')
  }
}

/** Shape, plus the liveness an execution path requires. */
function assertBoundedPolicy(policy: SessionKeyInfo): void {
  assertPolicyShape(policy)
  if (policy.status !== 'active' || !policy.authorized) {
    throw new Error('The Naculus policy is not an active, owner-authorized off-chain policy.')
  }
  if (policy.scope.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Error('The Naculus policy has expired.')
  }
}

function assertTransaction(policy: SessionKeyInfo, transaction: SessionKeyTransaction): SessionKeyTransaction {
  if (transaction.chainId !== ZERODEV_SEPOLIA_CHAIN_ID) {
    throw new Error('ZeroDev payment execution is restricted to Sepolia.')
  }
  const to = normalizeAddress(transaction.to ?? '', 'Payment target')
  if (!policy.scope.allowedContracts?.some((allowed) => isAddressEqual(normalizeAddress(allowed, 'Allowed contract'), to))) {
    throw new Error('Payment target is outside the Naculus policy.')
  }
  const value = BigInt(transaction.value ?? '0')
  if (value < 0n || value > (policy.scope.maxValuePerTx ?? 0n)) {
    throw new Error('Payment value is outside the Naculus per-transaction limit.')
  }
  const data = transaction.data ?? '0x'
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error('Payment calldata must be even-length hexadecimal data.')
  }
  return {
    to,
    value: value.toString(),
    data: data as Hex,
    chainId: ZERODEV_SEPOLIA_CHAIN_ID,
  }
}

function sessionAddress(policy: SessionKeyInfo): Address {
  if (!/^0x[0-9a-fA-F]{66}$/.test(policy.publicKey)) {
    throw new Error('Naculus session public key must be a compressed secp256k1 key.')
  }
  return publicKeyToAddress(policy.publicKey)
}

async function createSignatureSlot(policy: SessionKeyInfo): Promise<SignatureSlot> {
  const address = sessionAddress(policy)
  let expectedHash: Hex | null = null
  let armedSignature: Hex | null = null
  const account = toAccount({
    address,
    async signMessage({ message }) {
      const raw = typeof message === 'object' && 'raw' in message
        ? message.raw
        : null
      const rawHex = typeof raw === 'string'
        ? raw
        : raw instanceof Uint8Array
          ? `0x${Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
          : null
      if (!rawHex || !HASH_PATTERN.test(rawHex) || rawHex.toLowerCase() !== expectedHash?.toLowerCase()) {
        throw new Error('ZeroDev requested a session signature for an unexpected digest.')
      }
      if (!armedSignature) throw new Error('Naculus session signature was not supplied.')
      const signature = armedSignature
      expectedHash = null
      armedSignature = null
      return signature
    },
    async signTransaction() {
      throw new Error('The ZeroDev session signer cannot sign raw transactions.')
    },
    async signTypedData() {
      throw new Error('The ZeroDev session signer cannot sign arbitrary typed data.')
    },
  })
  return {
    signer: await toECDSASigner({ signer: account }),
    arm(expectedUserOperationHash, signature) {
      expectedHash = normalizeHash(expectedUserOperationHash, 'Expected UserOperation hash')
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new Error('Naculus session signature must be 65 bytes.')
      }
      armedSignature = signature
    },
  }
}

function buildZeroDevPolicies(policy: SessionKeyInfo) {
  // Shape, not liveness: these policies are also rebuilt to identify a
  // permission for uninstall, and an expired or locally revoked policy is
  // exactly the one that still needs uninstalling.
  assertPolicyShape(policy)
  const maximumValueAcrossAllCalls = policy.scope.maxTotalValue! / BigInt(policy.scope.maxTxCount!)
  const onchainValueLimit = maximumValueAcrossAllCalls < policy.scope.maxValuePerTx!
    ? maximumValueAcrossAllCalls
    : policy.scope.maxValuePerTx!
  if (onchainValueLimit < 1n) {
    throw new Error('The total value limit is too small for the configured transaction count.')
  }
  return [
    toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_5,
      permissions: policy.scope.allowedContracts!.map((target) => ({
        target: normalizeAddress(target, 'Allowed payment target'),
        // The on-chain limit is never looser than the owner-signed total
        // budget, even if the per-call limit was configured too generously.
        valueLimit: onchainValueLimit,
      })),
    }),
    toRateLimitPolicy({ count: policy.scope.maxTxCount! }),
    toTimestampPolicy({
      validAfter: Math.floor(policy.createdAt / 1000),
      validUntil: policy.scope.expiry,
    }),
  ]
}

function createClients(rpcUrl: string) {
  const normalizedRpcUrl = parseZeroDevRpcUrl(rpcUrl)
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(normalizedRpcUrl),
  })
  const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http(normalizedRpcUrl),
  })
  const bundlerClient = createBundlerClient({
    chain: sepolia,
    transport: http(normalizedRpcUrl),
  })
  return { publicClient, paymasterClient, bundlerClient }
}

/** Prove the configured service is the expected Sepolia EntryPoint endpoint. */
export async function verifyZeroDevSepoliaRpc(rpcUrl: string): Promise<void> {
  const { publicClient, bundlerClient } = createClients(rpcUrl)
  const [chainId, entryPoints] = await Promise.all([
    publicClient.getChainId(),
    bundlerClient.getSupportedEntryPoints(),
  ])
  if (chainId !== ZERODEV_SEPOLIA_CHAIN_ID) {
    throw new Error(`ZeroDev RPC is connected to chain ${chainId}, not Sepolia ${ZERODEV_SEPOLIA_CHAIN_ID}.`)
  }
  if (!entryPoints.some((address) => isAddressEqual(address, ENTRY_POINT.address))) {
    throw new Error(`ZeroDev bundler does not support the required EntryPoint ${ENTRY_POINT.address}.`)
  }
}

function hasSponsoredPaymaster(userOperation: PrepareUserOperationReturnType): boolean {
  const paymaster = 'paymaster' in userOperation
    ? userOperation.paymaster
    : undefined
  return typeof paymaster === 'string' &&
    isAddress(paymaster) &&
    !isAddressEqual(paymaster, '0x0000000000000000000000000000000000000000')
}

async function prepareRuntime(
  rpcUrl: string,
  policy: SessionKeyInfo,
  serializedPermissionAccount: string,
  transaction: SessionKeyTransaction,
  shouldConsumeSponsorship: boolean,
): Promise<PreparedRuntime> {
  const authoritativeTransaction = assertTransaction(policy, transaction)
  const { publicClient, paymasterClient, bundlerClient } = createClients(rpcUrl)
  const signatureSlot = await createSignatureSlot(policy)
  const account = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    serializedPermissionAccount,
    signatureSlot.signer,
  )
  if (!isAddressEqual(account.address, normalizeAddress(policy.signerAddress, 'Policy signer'))) {
    throw new Error('ZeroDev approval account does not match the Naculus policy owner.')
  }
  const expectedPermission = await toPermissionValidator(publicClient, {
    signer: signatureSlot.signer,
    policies: buildZeroDevPolicies(policy),
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  })
  const actualPermission = account.kernelPluginManager.regularValidator
  if (
    !actualPermission ||
    actualPermission.getIdentifier().toLowerCase() !== expectedPermission.getIdentifier().toLowerCase()
  ) {
    throw new Error('Stored ZeroDev permission does not match the current Naculus policy scope and session signer.')
  }

  const kernelClient = createKernelAccountClient({
    account,
    chain: sepolia,
    bundlerTransport: http(parseZeroDevRpcUrl(rpcUrl)),
    paymaster: {
      getPaymasterStubData: (userOperation) => paymasterClient.sponsorUserOperation({
        userOperation,
        shouldConsume: false,
      }),
      getPaymasterData: (userOperation) => paymasterClient.sponsorUserOperation({
        userOperation,
        shouldConsume: shouldConsumeSponsorship,
      }),
    },
  })
  const userOperation = await kernelClient.prepareUserOperation({
    calls: [{
      to: authoritativeTransaction.to as Address,
      value: BigInt(authoritativeTransaction.value ?? '0'),
      data: (authoritativeTransaction.data ?? '0x') as Hex,
    }],
  })
  const userOperationHash = getUserOperationHash({
    userOperation: {
      ...userOperation,
      signature: '0x',
    } as UserOperation<'0.7'>,
    entryPointAddress: ENTRY_POINT.address,
    entryPointVersion: ENTRY_POINT.version,
    chainId: ZERODEV_SEPOLIA_CHAIN_ID,
  })
  return {
    account,
    bundlerClient,
    publicClient,
    signatureSlot,
    userOperation,
    userOperationHash,
    sponsored: hasSponsoredPaymaster(userOperation),
  }
}

/**
 * Whether this account delegates to the executor we expect.
 *
 * `null` when the code could not be read. That is not "not delegated": a
 * failed `eth_getCode` would otherwise be reported to the user as "the Kernel
 * delegation is not installed on chain", sending them to re-run a setup that
 * costs gas for a delegation that is already there.
 */
function readDelegatedTo(
  code: unknown,
  executorAddress: Address,
): boolean | null {
  // core's readDelegation owns the EIP-7702 designator format, including the
  // 23-byte length and the zero-address clear. This only adds the question
  // core cannot answer: whether the delegate is the executor we installed.
  const status = readDelegation(code)
  if (status.delegated === null) return null
  if (!status.delegated || !status.delegate) return false
  return isAddressEqual(status.delegate, executorAddress)
}

async function checkInstalledRuntime(
  runtime: Pick<PreparedRuntime, 'account' | 'publicClient'>,
): Promise<{ delegated: boolean; permissionInstalled: boolean; executorAddress: Address }> {
  const executorAddress = runtime.account.accountImplementationAddress
  // viem answers undefined for an account with no code; the reader wants the
  // RPC's own "0x" so that "no code" stays distinct from "not read".
  const code = await runtime.publicClient.getCode({ address: runtime.account.address })
  const delegation = readDelegatedTo(code ?? "0x", executorAddress)
  if (delegation === null) {
    throw new Error(
      'Could not read account code from the Sepolia RPC, so whether the Kernel delegation is installed is unknown. Retry rather than re-running setup.',
    )
  }
  const delegated = delegation
  const permissionInstalled = await runtime.account.kernelPluginManager.isEnabled(
    runtime.account.address,
    '0x00000000',
  )
  return { delegated, permissionInstalled, executorAddress }
}

async function sendPreparedRuntime(runtime: PreparedRuntime, signature: Hex): Promise<Hex> {
  runtime.signatureSlot.arm(runtime.userOperationHash, signature)
  const wrappedSignature = await runtime.account.signUserOperation(
    runtime.userOperation as UserOperation<'0.7'>,
  )
  const submittedHash = await runtime.bundlerClient.sendUserOperation({
    ...runtime.userOperation,
    signature: wrappedSignature,
    entryPointAddress: ENTRY_POINT.address,
  })
  if (submittedHash.toLowerCase() !== runtime.userOperationHash.toLowerCase()) {
    throw new Error('Bundler returned a UserOperation hash that does not match the locally prepared operation.')
  }
  return submittedHash
}

/**
 * Wait for a UserOperation and record when each stage actually happened.
 *
 * Only records what it observes. `authorized` and `submitted` happened before
 * this function was called, so the caller passes them in rather than letting
 * this stamp "now" on them — a timestamp taken when we started waiting is not
 * when the thing occurred, and a made-up timestamp is worse than a missing one
 * because it produces a duration that looks measured.
 */
export async function waitForZeroDevUserOperation(
  rpcUrl: string,
  userOperationHash: Hex,
  expectedSender: Address,
  requiredConfirmations = 2,
  priorTimeline: PaymentTimeline = startTimeline(),
  now: () => number = Date.now,
): Promise<ZeroDevUserOperationEvidence> {
  const hash = normalizeHash(userOperationHash, 'UserOperation hash')
  const { bundlerClient, publicClient } = createClients(rpcUrl)
  const userOperationReceipt = await bundlerClient.waitForUserOperationReceipt({
    hash,
    timeout: 240_000,
  })
  if (userOperationReceipt.userOpHash.toLowerCase() !== hash.toLowerCase()) {
    throw new Error('UserOperation receipt hash does not match the submitted hash.')
  }
  if (!isAddressEqual(userOperationReceipt.sender, expectedSender)) {
    throw new Error('UserOperation receipt sender does not match the approved owner.')
  }
  if (!userOperationReceipt.success || userOperationReceipt.receipt.status !== 'success') {
    throw new Error(userOperationReceipt.reason ?? 'UserOperation reverted on Sepolia.')
  }
  const transactionHash = normalizeHash(
    userOperationReceipt.receipt.transactionHash,
    'UserOperation transaction hash',
  )
  const transactionReceipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: requiredConfirmations,
    timeout: 240_000,
  })
  if (transactionReceipt.status !== 'success' || transactionReceipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw new Error('Public Sepolia transaction receipt did not verify successfully.')
  }
  const latestBlock = await publicClient.getBlockNumber()
  const confirmations = Number(latestBlock - transactionReceipt.blockNumber + 1n)
  if (confirmations < requiredConfirmations) {
    throw new Error(`Expected ${requiredConfirmations} confirmations, received ${confirmations}.`)
  }

  // Inclusion is timestamped from the block, not from when this poll returned.
  // Polling can lag a block by seconds, and charging that lag to the
  // submit -> include leg would make the bundler look slow and the wait look
  // fast. When the block cannot be read, the observation time is used and the
  // evidence string says so, because a timestamp whose meaning is unclear is
  // worse than one that is labelled.
  let includedAt = now()
  let includedEvidence = `block ${transactionReceipt.blockNumber}, observed (block timestamp unavailable)`
  try {
    const block = await publicClient.getBlock({
      blockNumber: transactionReceipt.blockNumber,
    })
    includedAt = Number(block.timestamp) * 1000
    includedEvidence = `block ${transactionReceipt.blockNumber} at ${new Date(includedAt).toISOString()}`
  } catch {
    // Keep the observation time and the label that admits what it is.
  }

  let timeline = recordStage(priorTimeline, 'included', includedEvidence, includedAt)
  // Confirmation depth is a property of the chain head, so the honest stamp is
  // when we saw it, bounded above by the poll interval.
  timeline = recordStage(
    timeline,
    'confirmed',
    `${confirmations} confirmation(s) of ${transactionHash}, observed`,
    now(),
  )

  return {
    userOperationHash: hash,
    transactionHash,
    sender: userOperationReceipt.sender,
    success: true,
    blockNumber: Number(transactionReceipt.blockNumber),
    confirmations,
    actualGasCostWei: userOperationReceipt.actualGasCost.toString(),
    actualGasUsed: userOperationReceipt.actualGasUsed.toString(),
    verifiedAt: new Date().toISOString(),
    timeline,
  }
}

/**
 * Revoke the on-chain permission this owner installed.
 *
 * Until this existed, revoking meant setting a local status to "revoked",
 * which stops *this* application from signing and leaves the Kernel
 * permission installed on chain. Anyone holding the session key material —
 * including a copy of another tab's storage — could keep executing inside the
 * bounds until the expiry or the count and value caps ran out. The interface
 * said the authorization was cancelled; the chain disagreed.
 *
 * Owner-authorized, deliberately. The session key must not be able to touch
 * its own permission: a key that can uninstall can also be made to look
 * uninstalled. So this needs the owner key again, which is the same authority
 * that installed it.
 *
 * Works on a policy that is expired or already locally revoked, because those
 * are the states whose on-chain permission most needs clearing.
 */
export async function revokeZeroDev7702Permission(args: {
  rpcUrl: string
  ownerPrivateKey: string
  policy: SessionKeyInfo
  storage?: StorageLike
}): Promise<ZeroDevUserOperationEvidence> {
  const rpcUrl = parseZeroDevRpcUrl(args.rpcUrl)
  // Local checks first: a malformed policy costs nothing to reject and should
  // not spend a network round trip, and the key is still untouched either way.
  assertPolicyShape(args.policy)
  await verifyZeroDevSepoliaRpc(rpcUrl)
  if (!PRIVATE_KEY_PATTERN.test(args.ownerPrivateKey)) {
    throw new Error('Embedded owner private key is not a 32-byte EVM private key.')
  }
  const owner = privateKeyToAccount(args.ownerPrivateKey as Hex)
  if (!isAddressEqual(owner.address, normalizeAddress(args.policy.signerAddress, 'Policy signer'))) {
    throw new Error('Embedded owner key does not match the Naculus policy signer.')
  }

  const storage = args.storage ?? browserStorage()
  const record = loadZeroDev7702Approval(args.policy.signerAddress, args.policy.id, storage)
  if (!record) {
    throw new Error('No stored ZeroDev permission for this policy, so there is nothing to revoke on chain.')
  }

  const { publicClient, paymasterClient } = createClients(rpcUrl)
  const signatureSlot = await createSignatureSlot(args.policy)
  const permissionPlugin = await toPermissionValidator(publicClient, {
    signer: signatureSlot.signer,
    policies: buildZeroDevPolicies(args.policy),
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  })

  // Uninstalling the wrong plugin would leave the dangerous one installed
  // while reporting success, so the rebuilt identity is checked against the
  // one the stored approval actually carries.
  const installedAccount = await deserializePermissionAccount(
    publicClient,
    ENTRY_POINT,
    KERNEL_VERSION,
    record.serializedPermissionAccount,
    signatureSlot.signer,
  )
  const installed = installedAccount.kernelPluginManager.regularValidator
  if (
    !installed ||
    installed.getIdentifier().toLowerCase() !== permissionPlugin.getIdentifier().toLowerCase()
  ) {
    throw new Error('The stored ZeroDev permission does not match this policy, so revoking it would target the wrong plugin.')
  }

  // The owner is the EIP-7702 sudo authority, so the uninstall is signed by
  // the owner rather than routed through the permission being removed.
  const ownerAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    eip7702Account: owner,
  })
  if (!isAddressEqual(ownerAccount.address, owner.address)) {
    throw new Error('ZeroDev EIP-7702 account does not match the embedded owner.')
  }
  const kernelClient = createKernelAccountClient({
    account: ownerAccount,
    chain: sepolia,
    bundlerTransport: http(rpcUrl),
    paymaster: {
      getPaymasterStubData: (userOperation) => paymasterClient.sponsorUserOperation({
        userOperation,
        shouldConsume: false,
      }),
      getPaymasterData: (userOperation) => paymasterClient.sponsorUserOperation({
        userOperation,
        shouldConsume: true,
      }),
    },
  })

  // The owner key signs inside uninstallPlugin, so authorization and
  // submission are a few hundred milliseconds apart here rather than a user
  // decision apart. Both are still recorded: a leg that is genuinely near-zero
  // is a measurement, and leaving it out would make the timeline start at
  // submission and quietly drop whatever this step does cost.
  let timeline = recordStage(
    startTimeline(),
    'authorized',
    `owner ${owner.address} authorized uninstalling policy ${args.policy.id}`,
    Date.now(),
  )
  const userOperationHash = await uninstallPlugin(kernelClient, {
    plugin: permissionPlugin,
  })
  timeline = recordStage(
    timeline,
    'submitted',
    `UserOperation ${userOperationHash} accepted by the bundler`,
    Date.now(),
  )
  const evidence = await waitForZeroDevUserOperation(
    rpcUrl,
    userOperationHash,
    owner.address,
    2,
    timeline,
  )

  // Local state is cleared only after the chain has confirmed. The other
  // order is the failure this function exists to remove: a user told the
  // authorization is gone while the permission is still installed.
  removeZeroDev7702Approval(args.policy.signerAddress, args.policy.id, storage)
  return evidence
}

export async function initializeZeroDev7702Permission(args: {
  rpcUrl: string
  ownerPrivateKey: string
  policy: SessionKeyInfo
  transaction: SessionKeyTransaction
  signDigest: (digest: Hex, transaction: SessionKeyTransaction) => Promise<Hex>
  storage?: StorageLike
}): Promise<{ approval: ZeroDev7702ApprovalRecord; evidence: ZeroDevUserOperationEvidence }> {
  const rpcUrl = parseZeroDevRpcUrl(args.rpcUrl)
  await verifyZeroDevSepoliaRpc(rpcUrl)
  assertBoundedPolicy(args.policy)
  const transaction = assertTransaction(args.policy, args.transaction)
  if (!PRIVATE_KEY_PATTERN.test(args.ownerPrivateKey)) {
    throw new Error('Embedded owner private key is not a 32-byte EVM private key.')
  }
  const owner = privateKeyToAccount(args.ownerPrivateKey as Hex)
  if (!isAddressEqual(owner.address, normalizeAddress(args.policy.signerAddress, 'Policy signer'))) {
    throw new Error('Embedded owner key does not match the Naculus policy signer.')
  }

  const { publicClient } = createClients(rpcUrl)
  const signatureSlot = await createSignatureSlot(args.policy)
  const permissionPlugin = await toPermissionValidator(publicClient, {
    signer: signatureSlot.signer,
    policies: buildZeroDevPolicies(args.policy),
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  })
  const ownerApprovedAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    eip7702Account: owner,
    plugins: { regular: permissionPlugin },
  })
  if (!isAddressEqual(ownerApprovedAccount.address, owner.address)) {
    throw new Error('ZeroDev EIP-7702 account does not match the embedded owner.')
  }

  // This serialization contains the owner-signed plugin enable authorization
  // and EIP-7702 authorization, but never the owner or session private key.
  const serializedPermissionAccount = await serializePermissionAccount(ownerApprovedAccount)
  const runtime = await prepareRuntime(
    rpcUrl,
    args.policy,
    serializedPermissionAccount,
    transaction,
    true,
  )
  if (!runtime.sponsored) {
    throw new Error('ZeroDev did not return sponsored paymaster data for the setup UserOperation.')
  }
  const digest = zeroDevSessionDigest(runtime.userOperationHash)
  const signature = await args.signDigest(digest, transaction)
  // Stamped after signDigest resolves, because that is when the owner actually
  // committed. Stamping before it would fold however long the user spent
  // looking at the prompt into the bundler's leg.
  let timeline = recordStage(
    startTimeline(),
    'authorized',
    `owner signature over setup digest ${digest}`,
    Date.now(),
  )
  const setupUserOperationHash = await sendPreparedRuntime(runtime, signature)
  timeline = recordStage(
    timeline,
    'submitted',
    `UserOperation ${setupUserOperationHash} accepted by the bundler`,
    Date.now(),
  )
  const evidence = await waitForZeroDevUserOperation(
    rpcUrl,
    setupUserOperationHash,
    owner.address,
    2,
    timeline,
  )
  const installation = await checkInstalledRuntime(runtime)
  if (!installation.delegated || !installation.permissionInstalled) {
    throw new Error('Setup transaction landed, but the Kernel delegation or bounded permission is not installed on chain.')
  }

  const approval: ZeroDev7702ApprovalRecord = {
    version: 1,
    chainId: ZERODEV_SEPOLIA_CHAIN_ID,
    ownerAddress: owner.address,
    policyId: args.policy.id,
    sessionAddress: sessionAddress(args.policy),
    smartAccountAddress: runtime.account.address,
    executorAddress: installation.executorAddress,
    serializedPermissionAccount,
    installedAt: new Date().toISOString(),
    setupUserOperationHash,
    setupTransactionHash: evidence.transactionHash,
  }
  saveZeroDev7702Approval(approval, args.storage)
  return { approval, evidence }
}

export function createZeroDev7702Adapter(args: {
  rpcUrl: string
  storage?: StorageLike
}): PolicyExecutionAdapter {
  const rpcUrl = parseZeroDevRpcUrl(args.rpcUrl)
  // Keep browser storage lazy so the adapter can be constructed during SSR.
  const storage = () => args.storage ?? browserStorage()

  async function loadBoundApproval(policy: SessionKeyInfo): Promise<ZeroDev7702ApprovalRecord> {
    assertBoundedPolicy(policy)
    const record = loadZeroDev7702Approval(policy.signerAddress, policy.id, storage())
    if (!record) throw new Error('No verified on-chain ZeroDev permission is stored for this policy.')
    if (!isAddressEqual(record.sessionAddress, sessionAddress(policy))) {
      throw new Error('Stored ZeroDev permission is bound to a different Naculus session key.')
    }
    return record
  }

  async function inspect(policy: SessionKeyInfo, transaction: SessionKeyTransaction): Promise<{
    check: PolicyExecutionCheck
    runtime?: PreparedRuntime
  }> {
    try {
      const record = await loadBoundApproval(policy)
      const runtime = await prepareRuntime(
        rpcUrl,
        policy,
        record.serializedPermissionAccount,
        transaction,
        false,
      )
      const installation = await checkInstalledRuntime(runtime)
      const ready = installation.delegated && installation.permissionInstalled && runtime.sponsored
      return {
        check: {
          ready,
          authorizationInstalled: installation.delegated && installation.permissionInstalled,
          sponsored: runtime.sponsored,
          promptless: ready,
          executorAddress: installation.executorAddress,
          reason: ready
            ? 'Sepolia Kernel delegation, bounded permission, and sponsored UserOperation preflight all verified.'
            : !installation.delegated
              ? 'The embedded owner is not delegated to the expected Kernel implementation on Sepolia.'
              : !installation.permissionInstalled
                ? 'The bounded ZeroDev permission is not installed on chain.'
                : 'The ZeroDev paymaster did not provide sponsored execution data.',
        },
        runtime,
      }
    } catch (error) {
      return {
        check: {
          ready: false,
          authorizationInstalled: false,
          sponsored: false,
          promptless: false,
          reason: error instanceof Error ? error.message : 'ZeroDev execution preflight failed.',
        },
      }
    }
  }

  return {
    route: 'eip7702',
    async check({ policy, transaction }) {
      return (await inspect(policy, transaction)).check
    },
    async prepare({ policy, transaction }) {
      const record = await loadBoundApproval(policy)
      const authoritativeTransaction = assertTransaction(policy, transaction)
      const runtime = await prepareRuntime(
        rpcUrl,
        policy,
        record.serializedPermissionAccount,
        authoritativeTransaction,
        true,
      )
      const installation = await checkInstalledRuntime(runtime)
      if (!installation.delegated || !installation.permissionInstalled || !runtime.sponsored) {
        throw new Error('ZeroDev permission or sponsored route changed before preparation completed.')
      }
      const payload: AdapterPayload = {
        ...runtime,
        kind: 'senderpay-zerodev-7702-v1',
        policyId: policy.id,
        transaction: authoritativeTransaction,
      }
      return {
        digest: zeroDevSessionDigest(runtime.userOperationHash),
        transaction: authoritativeTransaction,
        payload,
      }
    },
    async broadcast({ policy, prepared, signature }) {
      const payload = prepared.payload as Partial<AdapterPayload> | null
      if (!payload || payload.kind !== 'senderpay-zerodev-7702-v1' || payload.policyId !== policy.id) {
        throw new Error('ZeroDev prepared payload is missing or bound to another policy.')
      }
      const runtime = payload as AdapterPayload
      const expectedDigest = zeroDevSessionDigest(runtime.userOperationHash)
      if (expectedDigest.toLowerCase() !== prepared.digest.toLowerCase()) {
        throw new Error('ZeroDev prepared digest changed before broadcast.')
      }
      const hash = await sendPreparedRuntime(runtime, signature)
      return { route: 'eip7702', hash, status: 'submitted' }
    },
  }
}
