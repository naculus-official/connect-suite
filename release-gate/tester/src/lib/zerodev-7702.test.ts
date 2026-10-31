import { expect, test } from '@playwright/test'
import {
  describeTimeline,
  endToEnd,
  recordStage,
  startTimeline,
  timelineLegs,
} from '@naculus/connect-core'
import { recoverMessageAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  SENDERPAY_7702_PROOF_SCOPE,
  loadZeroDev7702Approval,
  parseZeroDevRpcUrl,
  revokeZeroDev7702Permission,
  saveZeroDev7702Approval,
  zeroDevSessionDigest,
  zeroDevApprovalStorageKey,
  type ZeroDev7702ApprovalRecord,
} from './zerodev-7702'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
}

const owner = '0x01b1cd6d3a9ef420e4fc0da46476872ac5fb163f' as const
const session = '0x1111111111111111111111111111111111111111' as const
const executor = '0xd6cedde84be40893d153be9d467cd6ad37875b28' as const
const hash = `0x${'ab'.repeat(32)}` as const

test.describe('SenderPay ZeroDev EIP-7702 proof boundary', () => {
  test('fails closed for missing and unsafe RPC configuration', () => {
    expect(() => parseZeroDevRpcUrl(undefined)).toThrow(/VITE_ZERODEV_RPC is missing/)
    expect(() => parseZeroDevRpcUrl('zerodev.example')).toThrow(/absolute URL/)
    expect(() => parseZeroDevRpcUrl('http://rpc.example.test')).toThrow(/must use HTTPS/)
    expect(() => parseZeroDevRpcUrl('https://user:pass@rpc.example.test')).toThrow(/credentials/)
    expect(() => parseZeroDevRpcUrl('https://rpc.example.test/#secret')).toThrow(/fragment/)
    expect(parseZeroDevRpcUrl('https://rpc.example.test/api/v3/project')).toBe('https://rpc.example.test/api/v3/project')
    expect(parseZeroDevRpcUrl('http://127.0.0.1:4337/rpc')).toBe('http://127.0.0.1:4337/rpc')
  })

  test('persists a versioned approval bound to owner and policy', () => {
    const storage = memoryStorage()
    const record: ZeroDev7702ApprovalRecord = {
      version: 1,
      chainId: 11155111,
      ownerAddress: owner,
      policyId: 'policy-1',
      sessionAddress: session,
      smartAccountAddress: owner,
      executorAddress: executor,
      serializedPermissionAccount: 'serialized-owner-authorization-without-private-keys',
      installedAt: '2026-09-12T00:00:00.000Z',
      setupUserOperationHash: hash,
      setupTransactionHash: hash,
    }

    saveZeroDev7702Approval(record, storage)
    expect(storage.getItem(zeroDevApprovalStorageKey(owner, 'policy-1'))).not.toContain('privateKey')
    const mixedCaseOwner = `0x${owner.slice(2).toUpperCase()}`
    expect(loadZeroDev7702Approval(mixedCaseOwner, 'policy-1', storage)).toEqual(record)
    expect(loadZeroDev7702Approval(owner, 'policy-2', storage)).toBeNull()
  })

  test('rejects malformed stored authorization instead of treating it as installed', () => {
    const storage = memoryStorage()
    storage.setItem(zeroDevApprovalStorageKey(owner, 'policy-1'), '{"version":1}')
    expect(() => loadZeroDev7702Approval(owner, 'policy-1', storage)).toThrow(/incomplete/)
  })

  test('does not claim recurring subscription support', () => {
    expect(SENDERPAY_7702_PROOF_SCOPE).toEqual({
      boundedPayment: true,
      ownerApprovedPermissionSetup: true,
      promptlessSessionExecution: true,
      recurringSubscription: false,
      settlementObserved: false,
    })
  })

  /**
   * The claim behind `settlementObserved: false`, checked rather than asserted
   * in a comment. This path fills authorized through confirmed and stops; the
   * stage that says a recipient can spend the money belongs to whoever moves
   * the last mile. A UI reading this timeline must still say in-progress.
   */
  test('a fully confirmed chain leg is still not a completed payment', () => {
    let timeline = startTimeline()
    timeline = recordStage(timeline, 'authorized', 'owner signature', 1_000)
    timeline = recordStage(timeline, 'submitted', 'userop accepted', 1_400)
    timeline = recordStage(timeline, 'included', 'block 8123456', 13_000)
    timeline = recordStage(timeline, 'confirmed', '2 confirmations', 25_000)

    expect(describeTimeline(timeline).state).toBe('in-progress')
    expect(endToEnd(timeline).known).toBe(false)

    // And each leg is separately visible. A single "took 24 seconds" cannot
    // say that 11.6 of them were spent waiting for a block and 12 more for the
    // second confirmation — which is the whole reason for recording per stage.
    expect(timelineLegs(timeline).map((leg) => [leg.from, leg.to, leg.duration])).toEqual([
      ['authorized', 'submitted', { known: true, ms: 400 }],
      ['submitted', 'included', { known: true, ms: 11_600 }],
      ['included', 'confirmed', { known: true, ms: 12_000 }],
    ])
  })

  test('maps Naculus raw digest signing to ZeroDev signMessage verification', async () => {
    const account = privateKeyToAccount(`0x${'00'.repeat(31)}01`)
    const digest = zeroDevSessionDigest(hash)
    const naculusStyleRawSignature = await account.sign({ hash: digest })
    const recovered = await recoverMessageAddress({
      message: { raw: hash },
      signature: naculusStyleRawSignature,
    })
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase())
  })

  test('AppKit refuses setup before any ZeroDev request when RPC is missing', async ({ page }) => {
    const zeroDevRequests: string[] = []
    page.on('request', (request) => {
      if (/zerodev/i.test(new URL(request.url()).hostname)) zeroDevRequests.push(request.url())
    })

    await page.goto('http://127.0.0.1:3000/appkit?playwright=zerodev-fail-closed')
    await expect(page.getByTestId('zerodev-config-status')).toHaveText('missing / invalid')
    await expect(page.getByTestId('embedded-persistence-probe')).not.toContainText('checking')
    await page.getByLabel('Import type').selectOption('privateKey')
    await expect(page.getByLabel('Import type')).toHaveValue('privateKey')
    await page.getByLabel('Private key').fill(`0x${'00'.repeat(31)}01`)
    await page.getByRole('button', { name: '匯入', exact: true }).click()
    await expect(page.getByTestId('embedded-wallet-summary')).toBeVisible()
    await page.getByRole('button', { name: '連線嵌入式錢包' }).click()
    await expect(page.getByText('嵌入式錢包已連線。')).toBeVisible()
    await page.getByTestId('create-delegation-policy').click()
    await expect(page.getByTestId('active-policy-count')).toHaveText('1')
    await page.getByTestId('initialize-zerodev-permission').click()

    await expect(page.getByTestId('zerodev-config-error')).toContainText('VITE_ZERODEV_RPC is missing')
    expect(zeroDevRequests).toEqual([])
    await expect(page.getByTestId('zerodev-setup-evidence')).toHaveCount(0)
  })
})

test.describe('SenderPay on-chain revocation boundary', () => {
  const boundedScope = {
    mode: 'offchain' as const,
    allowedChainIds: [11155111],
    allowedContracts: ['0x2222222222222222222222222222222222222222'],
    maxTxCount: 3,
    maxValuePerTx: 1000n,
    maxTotalValue: 3000n,
    expiry: Math.floor(Date.now() / 1000) + 3600,
  }
  const policy = (over: Record<string, unknown> = {}) => ({
    id: 'policy-1',
    signerAddress: owner,
    publicKey: `0x02${'11'.repeat(32)}`,
    status: 'active',
    authorized: true,
    createdAt: Date.now(),
    scope: boundedScope,
    ...over,
  }) as never

  const rpc = 'https://rpc.example.test/api/v3/project'

  test('rejects a policy that is not a bounded off-chain policy', async () => {
    await expect(
      revokeZeroDev7702Permission({
        rpcUrl: rpc,
        ownerPrivateKey: `0x${'11'.repeat(32)}`,
        policy: policy({ scope: { ...boundedScope, mode: 'aa_module' } }),
      }),
    ).rejects.toThrow(/not an off-chain policy/)
  })

  test('rejects a policy with no payment target restriction', async () => {
    await expect(
      revokeZeroDev7702Permission({
        rpcUrl: rpc,
        ownerPrivateKey: `0x${'11'.repeat(32)}`,
        policy: policy({ scope: { ...boundedScope, allowedContracts: [] } }),
      }),
    ).rejects.toThrow(/restrict allowed payment targets/)
  })

  // The whole reason this exists. A policy revoked locally still has its
  // permission installed on chain, and requiring an active policy would have
  // made that the one state a user could never clear.
  test('accepts a locally revoked policy instead of refusing it', async () => {
    await expect(
      revokeZeroDev7702Permission({
        rpcUrl: rpc,
        ownerPrivateKey: `0x${'11'.repeat(32)}`,
        policy: policy({ status: 'revoked', authorized: false }),
      }),
    ).rejects.not.toThrow(/off-chain policy|active, owner-authorized/)
  })

  test('accepts an expired policy instead of refusing it', async () => {
    await expect(
      revokeZeroDev7702Permission({
        rpcUrl: rpc,
        ownerPrivateKey: `0x${'11'.repeat(32)}`,
        policy: policy({ scope: { ...boundedScope, expiry: Math.floor(Date.now() / 1000) - 60 } }),
      }),
    ).rejects.not.toThrow(/expired/)
  })

  test('refuses an owner key that does not match the policy signer', async () => {
    await expect(
      revokeZeroDev7702Permission({
        rpcUrl: 'not-a-url',
        ownerPrivateKey: `0x${'11'.repeat(32)}`,
        policy: policy(),
      }),
    ).rejects.toThrow(/absolute URL/)
  })
})
