import {
  DELEGATION_FRAMEWORK,
  MemoryStorageAdapter,
  SessionKeyManager,
  type SessionKeyRail,
  sessionKeyAddress,
} from "@naculus/connect-core";
import {
  decodeFunctionData,
  keccak256,
  parseSignature,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import {
  createDelegationFrameworkAdapter,
  type RedemptionCodec,
  type RedemptionRpc,
} from "./delegation-framework-adapter";
import {
  createDelegationPolicyFlow,
  type DelegationPolicyDeps,
  type PolicyExecutionAdapter,
} from "./delegation-policy";

/**
 * eip7702 policies end to end: the owner (viem account) signs the Delegation,
 * connect-core attaches it, the adapter builds the redemption, the flow signs
 * it with the session key and broadcasts. Encoding and signing are checked
 * with viem, an implementation independent of connect-core.
 */

const owner = privateKeyToAccount(`0x${"42".repeat(32)}`);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const PAYEE = "0x2222222222222222222222222222222222222222" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const TX_HASH = `0x${"ff".repeat(32)}` as const;

const codec: RedemptionCodec = {
  signingHash: (tx) => keccak256(serializeTransaction(tx)),
  serialize: (tx, signature) =>
    serializeTransaction(tx, parseSignature(signature)),
};

const scope = {
  mode: "eip7702" as const,
  allowedContracts: [USDC],
  allowedMethods: ["0xa9059cbb"],
  tokenAllowances: { [USDC]: 1_000n },
  allowedRecipients: [PAYEE],
  rails: ["transfer", "x402-exact", "mpp-charge"] as SessionKeyRail[],
};

function transfer(to: string, amount: bigint) {
  return {
    to: USDC,
    chainId: 8453,
    data: `0xa9059cbb${to.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`,
  };
}

function setup(
  overrides: Partial<DelegationPolicyDeps> = {},
  wrapAdapter: (a: PolicyExecutionAdapter) => PolicyExecutionAdapter = (a) => a,
  rpcOverrides: Partial<RedemptionRpc> = {},
) {
  const manager = new SessionKeyManager(
    { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
    new MemoryStorageAdapter(),
  );
  const sent: `0x${string}`[] = [];
  const adapter = createDelegationFrameworkAdapter({
    manager,
    codec,
    chainId: () => 8453,
    rpc: {
      getTransactionCount: async () => 7,
      estimateGas: async () => 200_000n,
      fees: async () => ({
        maxFeePerGas: 30_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      }),
      sendRawTransaction: async (raw) => {
        sent.push(raw);
        return TX_HASH;
      },
      ...rpcOverrides,
    },
  });
  const deps: DelegationPolicyDeps = {
    manager,
    origin: "https://app.test",
    signer: () => owner.address,
    signMessage: vi.fn(async () => `0x${"11".repeat(65)}`),
    verifySignature: vi.fn(async () => true),
    previewExecution: () => ({
      strategy: "sequential",
      atomic: false,
      sponsored: false,
      reason: "plan",
      route: "sequential",
    }),
    delegation: () => ({
      delegated: true,
      delegate: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator,
    }),
    encryptionKeyConfigured: true,
    storageAvailable: () => true,
    refresh: vi.fn(async () => {}),
    signTypedData: async (typed) =>
      owner.signTypedData({
        ...typed,
        message: { ...typed.message, salt: BigInt(typed.message.salt) },
      } as never),
    chainId: () => 8453,
    adapter: wrapAdapter(adapter),
    ...overrides,
  };
  return { manager, flow: createDelegationPolicyFlow(deps), sent, adapter };
}

describe("eip7702 policies", () => {
  it("creates a policy authorized by the owner's signed delegation", async () => {
    const { flow } = setup();
    const policy = await flow.createPolicy(scope);
    expect(policy.scope.mode).toBe("eip7702");
    expect(policy.authorized).toBe(true);
  });

  it("executes through the redemption, signed by the session key over what is broadcast", async () => {
    const { flow, sent } = setup();
    const policy = await flow.createPolicy(scope);
    const tx = transfer(PAYEE, 400n);

    const preview = await flow.previewPolicyExecution(policy.id, tx);
    expect(preview.broadcastReady).toBe(true);
    expect(preview.broadcastRoute).toBe("eip7702");

    await expect(flow.executePolicy(policy.id, tx)).resolves.toEqual({
      route: "eip7702",
      hash: TX_HASH,
      status: "submitted",
    });
    expect(sent).toHaveLength(1);
    const raw = sent[0] as `0x${string}`;
    const parsed = parseTransaction(raw);
    expect(parsed.to?.toLowerCase()).toBe(
      DELEGATION_FRAMEWORK.delegationManager.toLowerCase(),
    );
    expect(parsed.chainId).toBe(8453);
    expect(parsed.value ?? 0n).toBe(0n);
    // viem recovers the session key as the sender.
    expect(
      (
        await recoverTransactionAddress({ serializedTransaction: raw as never })
      ).toLowerCase(),
    ).toBe(sessionKeyAddress(policy.publicKey));
    // And decodes the call as the redemption of this execution.
    const decoded = decodeFunctionData({
      abi: [
        {
          type: "function",
          name: "redeemDelegations",
          inputs: [
            { name: "c", type: "bytes[]" },
            { name: "m", type: "bytes32[]" },
            { name: "e", type: "bytes[]" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      data: parsed.data as `0x${string}`,
    });
    expect((decoded.args[2] as string[])[0]?.toLowerCase()).toBe(
      `${USDC.toLowerCase()}${"0".repeat(64)}${tx.data.slice(2)}`,
    );
  });

  it("refuses an execution outside the scope", async () => {
    const { flow, sent } = setup();
    const policy = await flow.createPolicy(scope);
    const preview = await flow.previewPolicyExecution(
      policy.id,
      transfer(OTHER, 1n),
    );
    expect(preview.broadcastReady).toBe(false);
    await expect(
      flow.executePolicy(policy.id, transfer(OTHER, 1n)),
    ).rejects.toMatchObject({ code: "method_not_allowed" });
    expect(sent).toEqual([]);
  });

  it("refuses an adapter that swaps the execution", async () => {
    // The redemption would carry a different value than the one checked.
    const swapped = setup({}, (adapter) => ({
      ...adapter,
      prepare: async (request) => {
        const prepared = await adapter.prepare(request);
        const payload = prepared.payload as {
          execution: { target: string; value: bigint; callData: string };
        };
        return {
          ...prepared,
          payload: {
            ...(prepared.payload as object),
            execution: { ...payload.execution, value: 1n },
          },
        };
      },
    }));
    const policy = await swapped.flow.createPolicy(scope);
    await expect(
      swapped.flow.executePolicy(policy.id, transfer(PAYEE, 1n)),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(swapped.sent).toEqual([]);
  });

  it("refuses a request for another chain than the delegation's", async () => {
    const { flow, sent } = setup();
    const policy = await flow.createPolicy(scope);
    await expect(
      flow.executePolicy(policy.id, { ...transfer(PAYEE, 1n), chainId: 1 }),
    ).rejects.toMatchObject({ code: "chain_mismatch" });
    expect(sent).toEqual([]);
  });

  it("is not ready with an adapter for another route", async () => {
    const { flow } = setup({}, (adapter) => ({ ...adapter, route: "erc4337" }));
    const policy = await flow.createPolicy(scope);
    const preview = await flow.previewPolicyExecution(
      policy.id,
      transfer(PAYEE, 1n),
    );
    expect(preview.broadcastReady).toBe(false);
    expect(preview.ready).toBe(false);
  });

  it("never signs a raw policy digest for an eip7702 policy", async () => {
    const { flow } = setup();
    const policy = await flow.createPolicy(scope);
    await expect(
      flow.signPolicyDigest(policy.id, {
        digest: `0x${"ab".repeat(32)}`,
        request: {
          type: "eip1559",
          chainId: 8453,
          nonce: "0x0",
          gas: "0x5208",
          maxFeePerGas: "0x3b9aca00",
          maxPriorityFeePerGas: "0x1",
          to: USDC,
          data: transfer(PAYEE, 1n).data,
        },
        transaction: transfer(PAYEE, 1n),
        payload: null,
      }),
    ).rejects.toMatchObject({ code: "method_not_allowed" });
  });

  it.each([
    [
      "an account not delegated to the stateless DeleGator",
      { delegation: () => ({ delegated: false, delegate: null }) },
      "method_not_allowed",
    ],
    [
      "a wallet without signTypedData",
      { signTypedData: undefined },
      "method_not_allowed",
    ],
    ["no connected chain", { chainId: () => null }, "wallet_unavailable"],
    [
      "a signature from another account",
      {
        signTypedData: async (typed: never) =>
          privateKeyToAccount(`0x${"43".repeat(32)}`).signTypedData({
            ...(typed as object),
            message: {
              ...(typed as { message: object }).message,
              salt: BigInt(
                (typed as { message: { salt: string } }).message.salt,
              ),
            },
          } as never),
      },
      "session_key_invalid_input",
    ],
  ])("refuses to create with %s", async (_name, overrides, code) => {
    const { flow, manager } = setup(overrides as Partial<DelegationPolicyDeps>);
    await expect(flow.createPolicy(scope)).rejects.toMatchObject({ code });
    // Nothing usable is left behind.
    const sessions = await manager.listSessions();
    expect(sessions.every((s) => s.status !== "active" || !s.authorized)).toBe(
      true,
    );
  });
});

describe("eip7702 policies with period limits", () => {
  // Chain time in window 0 of a 100 s period; the device clock is far past it.
  const START = 1_000_000;
  const periodScope = {
    ...scope,
    periodLimits: { [USDC]: { amount: 500n, seconds: 100, start: START } },
  };

  it("signs with chainTime from the latest block and a 60 s margin", async () => {
    const latestBlock = vi.fn(async () => ({
      timestamp: `0x${(START + 10).toString(16)}` as `0x${string}`,
    }));
    const { flow, manager, sent } = setup({}, undefined, { latestBlock });
    const sign = vi.spyOn(manager, "signTransactionDelegationRedemption");
    const policy = await flow.createPolicy(periodScope);

    await expect(
      flow.executePolicy(policy.id, transfer(PAYEE, 400n)),
    ).resolves.toMatchObject({ hash: TX_HASH, status: "submitted" });
    expect(latestBlock).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0]?.[4]).toEqual({
      timestamp: START + 10,
      inclusionMarginSeconds: 60,
    });
    expect(sent).toHaveLength(1);
  });

  it("applies the 60 s margin: refuses 50 s before the period ends", async () => {
    const { flow, sent } = setup({}, undefined, {
      latestBlock: async () => ({ timestamp: START + 50 }),
    });
    const policy = await flow.createPolicy(periodScope);
    await expect(
      flow.executePolicy(policy.id, transfer(PAYEE, 1n)),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details: expect.stringMatching(/next period/),
    });
    expect(sent).toEqual([]);
  });

  it.each([
    ["no latestBlock method", {}],
    ["a null block", { latestBlock: async () => null }],
    ["a block without a timestamp", { latestBlock: async () => ({}) as never }],
    ["a zero timestamp", { latestBlock: async () => ({ timestamp: 0 }) }],
    [
      "a non-hex timestamp",
      { latestBlock: async () => ({ timestamp: "1000010" as never }) },
    ],
    [
      "an unsafe timestamp",
      { latestBlock: async () => ({ timestamp: 2 ** 53 }) },
    ],
  ])("refuses with %s, before signing or broadcasting", async (_name, rpc) => {
    const send = vi.fn(async () => TX_HASH);
    const { flow, manager } = setup({}, undefined, {
      sendRawTransaction: send,
      ...(rpc as Partial<RedemptionRpc>),
    });
    const sign = vi.spyOn(manager, "signTransactionDelegationRedemption");
    const policy = await flow.createPolicy(periodScope);
    await expect(
      flow.executePolicy(policy.id, transfer(PAYEE, 1n)),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(sign).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not read the block for a scope without period limits", async () => {
    const latestBlock = vi.fn(async () => null);
    const { flow, manager } = setup({}, undefined, { latestBlock });
    const sign = vi.spyOn(manager, "signTransactionDelegationRedemption");
    const policy = await flow.createPolicy(scope);
    await flow.executePolicy(policy.id, transfer(PAYEE, 1n));
    expect(latestBlock).not.toHaveBeenCalled();
    expect(sign.mock.calls[0]?.[4]).toBeUndefined();
  });
});
