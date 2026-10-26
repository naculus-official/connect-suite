import {
  MemoryStorageAdapter,
  SessionKeyManager,
  type TransactionRequest,
} from "@naculus/connect-core";
import { transactionSigningHash } from "@naculus/connect-core/signing";
import { describe, expect, it, vi } from "vitest";
import {
  buildDelegationPolicyMessage,
  createDelegationPolicyFlow,
  type DelegationPolicyDeps,
  sameExecutionIntent,
} from "./delegation-policy";

const SIGNER = "0x2222222222222222222222222222222222222222" as const;
const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const SIG = `0x${"11".repeat(65)}` as const;

function deps(overrides: Partial<DelegationPolicyDeps> = {}) {
  const manager = new SessionKeyManager(
    { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
    new MemoryStorageAdapter(),
  );
  const base: DelegationPolicyDeps = {
    manager,
    origin: "https://app.test",
    signer: () => SIGNER,
    signMessage: vi.fn(async () => SIG),
    // The test "wallet" always signs as SIGNER; recovery is simulated.
    verifySignature: vi.fn(
      async ({ signerAddress }) => signerAddress === SIGNER,
    ),
    previewExecution: () => ({
      strategy: "sequential",
      atomic: false,
      sponsored: false,
      reason: "plan",
      route: "sequential",
    }),
    delegation: () => ({ delegated: null, delegate: null }),
    encryptionKeyConfigured: true,
    storageAvailable: () => true,
    refresh: vi.fn(async () => {}),
  };
  return { manager, deps: { ...base, ...overrides } };
}

describe("buildDelegationPolicyMessage", () => {
  it("is canonical: same scope in a different order yields the same message", () => {
    const policy = (contracts: `0x${string}`[]) =>
      ({
        id: "p1",
        publicKey: "0xAB",
        signerAddress: SIGNER,
        expiresAt: 1_800_000_000_000,
        status: "active",
        createdAt: 0,
        useCount: 0,
        scope: {
          expiry: 1_800_000_000,
          mode: "offchain",
          allowedContracts: contracts,
          rails: ["transfer", "x402-exact", "mpp-charge"],
        },
      }) as never;
    expect(buildDelegationPolicyMessage(policy([CONTRACT, SIGNER]), "o")).toBe(
      buildDelegationPolicyMessage(policy([SIGNER, CONTRACT]), "o"),
    );
    expect(buildDelegationPolicyMessage(policy([CONTRACT]), "o")).toMatch(
      /^Naculus Session Policy v1\n\{"version":1,"origin":"o"/,
    );
  });
});

describe("sameExecutionIntent", () => {
  it("compares target, data, value and chain; quantities numerically", () => {
    const requested = { to: CONTRACT, value: "0x10", data: "0xAB", chainId: 1 };
    expect(
      sameExecutionIntent(requested, {
        ...requested,
        value: "16",
        data: "0xab",
      }),
    ).toBe(true);
    expect(sameExecutionIntent(requested, { ...requested, to: SIGNER })).toBe(
      false,
    );
    expect(sameExecutionIntent(requested, { ...requested, chainId: 10 })).toBe(
      false,
    );
  });

  it("does not treat an omitted field as a wildcard", () => {
    // Contract creation: the adapter may not supply a target.
    expect(
      sameExecutionIntent({ data: "0x60" }, { to: CONTRACT, data: "0x60" }),
    ).toBe(false);
    // Plain transfer: the adapter may not add calldata or a value.
    expect(
      sameExecutionIntent(
        { to: CONTRACT },
        { to: CONTRACT, data: "0xa9059cbb" },
      ),
    ).toBe(false);
    expect(
      sameExecutionIntent({ to: CONTRACT }, { to: CONTRACT, value: "5" }),
    ).toBe(false);
    // Nor pick a chain the caller did not name.
    expect(
      sameExecutionIntent({ to: CONTRACT }, { to: CONTRACT, chainId: 1 }),
    ).toBe(false);
    // Absent and zero mean the same thing.
    expect(
      sameExecutionIntent(
        { to: CONTRACT },
        { to: CONTRACT, value: "0", data: "0x" },
      ),
    ).toBe(true);
  });
});

describe("createDelegationPolicyFlow", () => {
  it("creates, signs, persists and verifies an off-chain policy", async () => {
    const { deps: d, manager } = deps();
    const flow = createDelegationPolicyFlow(d);
    const policy = await flow.createPolicy({
      allowedContracts: [CONTRACT],
      rails: ["transfer", "x402-exact", "mpp-charge"],
    });
    expect(policy.authorized).toBe(true);
    expect(policy.authorizationMessage).toBe(
      buildDelegationPolicyMessage(policy, "https://app.test"),
    );
    expect(d.refresh).toHaveBeenCalled();
    expect(await flow.verifyStoredPolicy(policy)).toBe(true);
    const preview = await flow.previewPolicyExecution(policy.id, {
      to: CONTRACT,
    });
    expect(preview.ready).toBe(true);
    expect(preview.broadcastReady).toBe(false);
    expect((await manager.listSessions())[0]?.status).toBe("active");
  });

  it("refuses before signing without a signer, key, storage, or with a non-offchain mode", async () => {
    for (const [override, code] of [
      [{ signer: () => null }, "wallet_unavailable"],
      [{ encryptionKeyConfigured: false }, "method_not_allowed"],
      [{ storageAvailable: () => false }, "storage_unavailable"],
    ] as const) {
      const { deps: d } = deps(override);
      await expect(
        createDelegationPolicyFlow(d).createPolicy({
          allowedContracts: [CONTRACT],
          rails: ["transfer", "x402-exact", "mpp-charge"],
        }),
      ).rejects.toMatchObject({ code });
      expect(d.signMessage).not.toHaveBeenCalled();
    }
    const { deps: d } = deps();
    await expect(
      createDelegationPolicyFlow(d).createPolicy({
        mode: "eip7702",
        allowedContracts: [CONTRACT],
        rails: ["transfer", "x402-exact", "mpp-charge"],
      }),
    ).rejects.toMatchObject({ code: "method_not_allowed" });
    // Executions here sign raw digests, which connect-core refuses while
    // recipients are limited: such a policy could never sign.
    await expect(
      createDelegationPolicyFlow(d).createPolicy({
        allowedContracts: [CONTRACT],
        allowedRecipients: [CONTRACT],
        rails: ["transfer", "x402-exact", "mpp-charge"],
      }),
    ).rejects.toMatchObject({ code: "method_not_allowed" });
    expect(d.signMessage).not.toHaveBeenCalled();
  });

  it("revokes the draft when the wallet's signature does not recover to the signer", async () => {
    const { deps: d, manager } = deps({ verifySignature: async () => false });
    await expect(
      createDelegationPolicyFlow(d).createPolicy({
        allowedContracts: [CONTRACT],
        rails: ["transfer", "x402-exact", "mpp-charge"],
      }),
    ).rejects.toThrow(/does not recover/);
    const sessions = await manager.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe("revoked");
  });

  it("executes only through an adapter whose prepared intent and submission are valid", async () => {
    const adapter = {
      route: "erc4337" as const,
      check: vi.fn(async () => ({
        ready: true,
        authorizationInstalled: true,
        sponsored: true,
        promptless: true,
        reason: "ok",
      })),
      prepare: vi.fn(
        async ({ transaction }: { transaction: { to?: string } }) => ({
          digest:
            "0xe649ddb4be4b513157aa3bb9d3e04888de1417953c42ed4080b4035c6a08b106" as const,
          request: {
            type: "eip1559" as const,
            chainId: 11155111,
            nonce: "0x0",
            gas: "0x5208",
            maxFeePerGas: "0x3b9aca00",
            maxPriorityFeePerGas: "0x1",
            to: SIGNER,
            value: "0x0",
          },
          transaction: { ...transaction, to: SIGNER }, // adapter swaps the target
          payload: null,
        }),
      ),
      broadcast: vi.fn(),
    };
    const { deps: d } = deps({ adapter });
    const flow = createDelegationPolicyFlow(d);
    const policy = await flow.createPolicy({
      allowedContracts: [CONTRACT],
      rails: ["transfer", "x402-exact", "mpp-charge"],
    });
    await expect(
      flow.executePolicy(policy.id, { to: CONTRACT }),
    ).rejects.toThrow(/changed the requested target/);
    expect(adapter.broadcast).not.toHaveBeenCalled();
  });

  it("refuses a prepared digest that is not the signing hash of its request, before signing", async () => {
    const { deps: d, manager } = deps();
    const flow = createDelegationPolicyFlow(d);
    const policy = await flow.createPolicy({
      allowedContracts: [CONTRACT],
      rails: ["transfer", "x402-exact", "mpp-charge"],
    });
    const signSpy = vi.spyOn(
      manager,
      "signTransactionWithVerifiedOffchainAuthorization",
    );
    const request: TransactionRequest = {
      type: "eip1559",
      chainId: 11155111,
      nonce: "0x0",
      gas: "0x5208",
      maxFeePerGas: "0x3b9aca00",
      maxPriorityFeePerGas: "0x1",
      to: CONTRACT,
      value: "0x0",
      data: "0x",
    };
    const prepared = {
      digest: `0x${"ab".repeat(32)}` as `0x${string}`,
      request,
      transaction: {
        to: CONTRACT,
        value: "0x0",
        data: "0x",
        chainId: 11155111,
      },
      payload: null,
    };
    await expect(flow.signPolicyDigest(policy.id, prepared)).rejects.toThrow(
      /does not match the signing hash/,
    );
    await expect(
      flow.signPolicyDigest(policy.id, prepared),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(signSpy).not.toHaveBeenCalled();
  });

  it("refuses a prepared request whose target differs from the checked transaction, before signing", async () => {
    const { deps: d, manager } = deps();
    const flow = createDelegationPolicyFlow(d);
    const policy = await flow.createPolicy({
      allowedContracts: [CONTRACT],
      rails: ["transfer", "x402-exact", "mpp-charge"],
    });
    const signSpy = vi.spyOn(
      manager,
      "signTransactionWithVerifiedOffchainAuthorization",
    );
    // The digest matches this request, so only the intent guard can refuse.
    const request: TransactionRequest = {
      type: "eip1559",
      chainId: 11155111,
      nonce: "0x0",
      gas: "0x5208",
      maxFeePerGas: "0x3b9aca00",
      maxPriorityFeePerGas: "0x1",
      to: SIGNER,
      value: "0x0",
      data: "0x",
    };
    const digest = `0x${Array.from(transactionSigningHash(request), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")}` as `0x${string}`;
    const prepared = {
      digest,
      request,
      transaction: {
        to: CONTRACT,
        value: "0x0",
        data: "0x",
        chainId: 11155111,
      },
      payload: null,
    };
    await expect(flow.signPolicyDigest(policy.id, prepared)).rejects.toThrow(
      /differs from the prepared transaction/,
    );
    await expect(
      flow.signPolicyDigest(policy.id, prepared),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(signSpy).not.toHaveBeenCalled();
  });
});
