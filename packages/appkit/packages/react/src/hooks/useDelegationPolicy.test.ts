/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionPreview } from "./useExecuteCalls";

const SIGNER = "0x1234567890123456789012345678901234567890" as const;
const SIGNATURE = `0x${"12".repeat(65)}`;
const MOCK_SESSION = { id: "embedded-policy-test" };
const mockRecoverMessageAddress = vi.hoisted(() => vi.fn());
const mockUseDelegation = vi.hoisted(() =>
  vi.fn(() => ({
    delegated: false as boolean | null,
    delegate: null as string | null,
    code: "0x",
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
);
const mockSignMessage = vi.fn(async () => SIGNATURE);
const mockPreview = vi.fn<() => ExecutionPreview>(() => ({
  strategy: "sequential",
  atomic: false,
  sponsored: false,
  reason: "The wallet will send each call separately.",
  route: "sequential",
}));

vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => ({ session: MOCK_SESSION }),
}));
vi.mock("./useAccount", () => ({
  useAccount: () => ({ evmAccount: `eip155:11155111:${SIGNER}` }),
}));
vi.mock("./useDelegation", () => ({
  useDelegation: () => mockUseDelegation(),
}));
vi.mock("./useExecuteCalls", () => ({
  useExecuteCalls: () => ({
    preview: mockPreview,
    execute: vi.fn(),
    isExecuting: false,
    error: null,
    lastRoute: null,
    reset: vi.fn(),
  }),
}));
vi.mock("./useSignMessage", () => ({
  useSignMessage: () => ({
    signMessage: mockSignMessage,
    isSigning: false,
    error: null,
  }),
}));
vi.mock("viem", () => ({
  recoverMessageAddress: mockRecoverMessageAddress,
}));

import {
  buildDelegationPolicyMessage,
  type DelegationPolicyPreview,
  type PolicyExecutionAdapter,
  useDelegationPolicy,
} from "./useDelegationPolicy";
import { __resetSessionKeyManagerForTests } from "./useSessionKeys";

const managerConfig = {
  storagePrefix: "naculus-delegation-policy-test",
  encryptionKey: "delegation-policy-test-key",
  pbkdf2Iterations: 10,
  unsafeAllowWeakKdf: true,
  requireAllowedContracts: true,
};

const scope = {
  mode: "offchain" as const,
  expiry: Math.floor(Date.now() / 1000) + 3600,
  maxTotalValue: 10_000n,
  maxValuePerTx: 1_000n,
  maxTxCount: 5,
  allowedContracts: [SIGNER],
  allowedChainIds: [11155111],
  rails: ["transfer" as const],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPreview.mockReturnValue({
    strategy: "sequential",
    atomic: false,
    sponsored: false,
    reason: "The wallet will send each call separately.",
    route: "sequential",
  });
  window.localStorage.clear();
  __resetSessionKeyManagerForTests();
  mockSignMessage.mockResolvedValue(SIGNATURE);
  mockRecoverMessageAddress.mockResolvedValue(SIGNER);
  mockUseDelegation.mockReturnValue({
    delegated: false,
    delegate: null,
    code: "0x",
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("useDelegationPolicy", () => {
  it("signs, persists, restores, previews, and revokes an off-chain policy", async () => {
    const first = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );
    let policyId = "";
    await act(async () => {
      const created = await first.result.current.createPolicy(scope);
      policyId = created.id;
      expect(created.authorized).toBe(true);
      expect(created.authorizationMessage).toContain(
        "Naculus Session Policy v1",
      );
    });
    expect(mockSignMessage).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(first.result.current.activePolicies[0]?.id).toBe(policyId),
    );

    const previews: DelegationPolicyPreview[] = [];
    await act(async () => {
      previews.push(
        await first.result.current.previewPolicyExecution(policyId, {
          to: SIGNER,
          value: "1",
          chainId: 11155111,
        }),
      );
    });
    expect(previews[0]?.ready).toBe(true);
    expect(previews[0]?.authorizationVerified).toBe(true);
    expect(previews[0]?.broadcastReady).toBe(false);
    expect(previews[0]?.broadcastRoute).toBeNull();
    expect(previews[0]?.onchainAuthorizationVerified).toBe(false);
    expect(previews[0]?.broadcastSponsored).toBeNull();
    expect(previews[0]?.reason).toMatch(/adapter is still required/i);

    await act(async () => {
      await expect(
        first.result.current.signPolicyDigest(policyId, {
          digest:
            "0xa7f8ba5cf61df04e84f5d9c77ff9f618bae0b4272317539bf45e9d8fc185b9c9",
          request: {
            type: "eip1559",
            chainId: 11155111,
            nonce: "0x0",
            gas: "0x5208",
            maxFeePerGas: "0x3b9aca00",
            maxPriorityFeePerGas: "0x1",
            to: SIGNER,
            value: "0x1",
          },
          transaction: {
            to: SIGNER,
            value: "1",
            chainId: 11155111,
          },
          payload: null,
        }),
      ).resolves.toMatch(/^0x[a-f0-9]{130}$/i);
    });

    first.unmount();
    __resetSessionKeyManagerForTests();
    const restored = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );
    await waitFor(() =>
      expect(restored.result.current.activePolicies[0]?.id).toBe(policyId),
    );

    await act(async () => {
      await restored.result.current.revokePolicy(policyId);
    });
    await waitFor(() =>
      expect(restored.result.current.activePolicies).toHaveLength(0),
    );
  });

  it("rolls back the draft when the main-wallet signature fails", async () => {
    mockSignMessage.mockRejectedValueOnce(new Error("User rejected"));
    const { result } = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );

    await act(async () => {
      await expect(result.current.createPolicy(scope)).rejects.toThrow(
        "User rejected",
      );
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.activePolicies).toEqual([]);
    expect(result.current.policies.every((policy) => !policy.authorized)).toBe(
      true,
    );
  });

  it("refuses an EIP-7702 policy without a typed-data signer", async () => {
    // An eip7702 policy is authorized only by a signed Delegation; without
    // the wallet's signTypedData there is nothing to authorize it with.
    const { result } = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );

    await act(async () => {
      await expect(
        result.current.createPolicy({ ...scope, mode: "eip7702" }),
      ).rejects.toMatchObject({ code: "method_not_allowed" });
    });
    expect(mockSignMessage).not.toHaveBeenCalled();
  });

  it("passes the EIP-7702 delegation for the given chain to signTypedData", async () => {
    mockUseDelegation.mockReturnValue({
      delegated: true,
      delegate: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
      code: "0x",
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    const signTypedData = vi.fn(async () => `0x${"12".repeat(65)}`);
    const { result } = renderHook(() =>
      useDelegationPolicy({
        managerConfig,
        origin: "https://example.test",
        signTypedData,
        chainId: 11155111,
      }),
    );

    await act(async () => {
      // The stub's signature does not recover to the account: core refuses
      // to attach it, and the draft is revoked.
      await expect(
        result.current.createPolicy({
          ...scope,
          mode: "eip7702",
          // Not the account itself: that target is refused before signing.
          allowedContracts: ["0x1111111111111111111111111111111111111111"],
          allowedMethods: ["0x12345678"],
        }),
      ).rejects.toMatchObject({ code: "session_key_invalid_input" });
    });
    expect(signTypedData).toHaveBeenCalledTimes(1);
    const typed = (
      signTypedData.mock.calls[0] as unknown as [
        {
          primaryType: string;
          domain: { chainId: number; verifyingContract: string };
        },
      ]
    )[0];
    expect(typed.primaryType).toBe("Delegation");
    expect(typed.domain).toMatchObject({
      chainId: 11155111,
      verifyingContract: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3",
    });
    expect(mockSignMessage).not.toHaveBeenCalled();
  });

  it("rejects a signature that does not belong to the connected account", async () => {
    mockRecoverMessageAddress.mockResolvedValueOnce(
      "0x9999999999999999999999999999999999999999",
    );
    const { result } = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );

    await act(async () => {
      await expect(result.current.createPolicy(scope)).rejects.toThrow(
        /does not recover to the connected EVM account/,
      );
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.activePolicies).toEqual([]);
  });

  it("requires an explicit host encryption key for persistent policies", async () => {
    const { encryptionKey: _omitted, ...insecureConfig } = managerConfig;
    const { result } = renderHook(() =>
      useDelegationPolicy({
        managerConfig: insecureConfig,
        origin: "https://example.test",
      }),
    );

    await act(async () => {
      await expect(result.current.createPolicy(scope)).rejects.toThrow(
        /host-provided encryptionKey/,
      );
    });
    expect(mockSignMessage).not.toHaveBeenCalled();
  });

  it("does not restore a policy whose persisted scope was altered", async () => {
    const first = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );
    await act(async () => {
      await first.result.current.createPolicy(scope);
    });
    await waitFor(() =>
      expect(first.result.current.activePolicies).toHaveLength(1),
    );
    first.unmount();

    const storageKey = `${managerConfig.storagePrefix}:session_keys`;
    const adapterValue = window.localStorage.getItem(storageKey);
    expect(adapterValue).not.toBeNull();
    const serializedRecords = JSON.parse(adapterValue as string) as string;
    const records = JSON.parse(serializedRecords) as Array<{
      scope: { maxTxCount?: number };
    }>;
    records[0].scope.maxTxCount = 50;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(JSON.stringify(records)),
    );

    __resetSessionKeyManagerForTests();
    const restored = renderHook(() =>
      useDelegationPolicy({ managerConfig, origin: "https://example.test" }),
    );
    await waitFor(() =>
      expect(restored.result.current.policies).toHaveLength(1),
    );
    await waitFor(() => expect(restored.result.current.loading).toBe(false));
    expect(restored.result.current.policies[0]?.authorized).toBe(true);
    expect(restored.result.current.activePolicies).toEqual([]);
  });

  it("executes only after an AA adapter proves the policy is installed", async () => {
    mockPreview.mockReturnValue({
      strategy: "refuse",
      atomic: false,
      sponsored: false,
      reason: "Sponsored gas is required, but no sponsored route is available.",
      route: null,
    });
    const transaction = {
      to: SIGNER,
      value: "1",
      chainId: 11155111,
    };
    const broadcast = vi.fn<PolicyExecutionAdapter["broadcast"]>(async () => ({
      route: "erc4337" as const,
      hash: `0x${"cd".repeat(32)}` as `0x${string}`,
      status: "submitted" as const,
    }));
    const adapter: PolicyExecutionAdapter = {
      route: "erc4337",
      check: vi.fn(async () => ({
        ready: true,
        authorizationInstalled: true,
        sponsored: true,
        promptless: true,
        reason: "The ERC-4337 module verified this policy on chain.",
      })),
      prepare: vi.fn(async () => ({
        digest:
          "0xa7f8ba5cf61df04e84f5d9c77ff9f618bae0b4272317539bf45e9d8fc185b9c9" as `0x${string}`,
        request: {
          type: "eip1559" as const,
          chainId: 11155111,
          nonce: "0x0",
          gas: "0x5208",
          maxFeePerGas: "0x3b9aca00",
          maxPriorityFeePerGas: "0x1",
          to: SIGNER,
          value: "0x1",
        },
        transaction,
        payload: { userOperation: "prepared" },
      })),
      broadcast,
    };
    const { result } = renderHook(() =>
      useDelegationPolicy({
        managerConfig,
        origin: "https://example.test",
        execution: { sponsorship: "required" },
        adapter,
      }),
    );
    let policyId = "";
    await act(async () => {
      policyId = (await result.current.createPolicy(scope)).id;
    });
    await waitFor(() =>
      expect(result.current.activePolicies[0]?.id).toBe(policyId),
    );

    const previews: DelegationPolicyPreview[] = [];
    await act(async () => {
      previews.push(
        await result.current.previewPolicyExecution(policyId, transaction),
      );
    });
    expect(previews[0]?.broadcastReady).toBe(true);
    expect(previews[0]?.broadcastRoute).toBe("erc4337");
    expect(previews[0]?.onchainAuthorizationVerified).toBe(true);
    expect(previews[0]?.broadcastSponsored).toBe(true);
    expect(previews[0]?.broadcastPromptless).toBe(true);
    expect(previews[0]?.ready).toBe(true);
    expect(previews[0]?.reason).not.toMatch(/no sponsored route/i);

    await act(async () => {
      await expect(
        result.current.executePolicy(policyId, transaction),
      ).resolves.toEqual({
        route: "erc4337",
        hash: `0x${"cd".repeat(32)}`,
        status: "submitted",
      });
    });
    expect(adapter.prepare).toHaveBeenCalledOnce();
    expect(adapter.broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0]?.[0]?.signature).toMatch(
      /^0x[a-f0-9]{130}$/i,
    );
    await waitFor(() =>
      expect(
        result.current.policies.find((policy) => policy.id === policyId)
          ?.useCount,
      ).toBe(1),
    );
  });

  it("refuses an adapter that changes the prepared execution intent", async () => {
    const transaction = {
      to: SIGNER,
      value: "1",
      chainId: 11155111,
    };
    const broadcast = vi.fn();
    const adapter: PolicyExecutionAdapter = {
      route: "erc4337",
      check: vi.fn(async () => ({
        ready: true,
        authorizationInstalled: true,
        sponsored: false,
        promptless: true,
        reason: "ready",
      })),
      prepare: vi.fn(async () => ({
        digest:
          "0x29be79c84b99b15887cd8e4eab2bfa6cde32e50c9792d63a5a6d3e0750e4e50f" as `0x${string}`,
        request: {
          type: "eip1559" as const,
          chainId: 11155111,
          nonce: "0x0",
          gas: "0x5208",
          maxFeePerGas: "0x3b9aca00",
          maxPriorityFeePerGas: "0x1",
          to: "0x9999999999999999999999999999999999999999",
          value: "0x1",
        },
        transaction: {
          ...transaction,
          to: "0x9999999999999999999999999999999999999999",
        },
        payload: {},
      })),
      broadcast,
    };
    const { result } = renderHook(() =>
      useDelegationPolicy({
        managerConfig,
        origin: "https://example.test",
        adapter,
      }),
    );
    let policyId = "";
    await act(async () => {
      policyId = (await result.current.createPolicy(scope)).id;
    });

    await act(async () => {
      await expect(
        result.current.executePolicy(policyId, transaction),
      ).rejects.toThrow(/changed the requested target/);
    });
    expect(broadcast).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refresh();
    });
    expect(
      result.current.policies.find((policy) => policy.id === policyId)
        ?.useCount,
    ).toBe(0);
  });

  it("does not arm an EIP-7702 adapter for a different delegate", async () => {
    mockUseDelegation.mockReturnValue({
      delegated: true,
      delegate: "0x8888888888888888888888888888888888888888",
      code: "0xef01008888888888888888888888888888888888888888",
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    const adapter: PolicyExecutionAdapter = {
      route: "eip7702",
      check: vi.fn(async () => ({
        ready: true,
        authorizationInstalled: true,
        sponsored: false,
        promptless: true,
        executorAddress:
          "0x9999999999999999999999999999999999999999" as `0x${string}`,
        reason: "delegate module is live",
      })),
      prepare: vi.fn(),
      broadcast: vi.fn(),
    };
    const { result } = renderHook(() =>
      useDelegationPolicy({
        managerConfig,
        origin: "https://example.test",
        adapter,
      }),
    );
    let policyId = "";
    await act(async () => {
      policyId = (await result.current.createPolicy(scope)).id;
    });
    const previews: DelegationPolicyPreview[] = [];
    await act(async () => {
      previews.push(
        await result.current.previewPolicyExecution(policyId, {
          to: SIGNER,
          value: "1",
          chainId: 11155111,
        }),
      );
    });
    expect(previews[0]?.broadcastReady).toBe(false);
    expect(previews[0]?.broadcastRoute).toBeNull();
    expect(previews[0]?.reason).toMatch(/does not match/);
  });
});

describe("buildDelegationPolicyMessage", () => {
  it("canonicalizes order-sensitive policy fields", () => {
    const policy = {
      id: "policy-1",
      publicKey: `0x${"12".repeat(33)}` as `0x${string}`,
      scope: {
        ...scope,
        allowedMethods: ["0xBBBBBBBB", "0xaaaaaaaa"],
        allowedChainIds: [11155111, 1],
      },
      status: "active" as const,
      createdAt: 1,
      expiresAt: 2,
      useCount: 0,
      signerAddress: SIGNER,
      authorized: false,
      authorizationType: "offchain" as const,
    };

    const message = buildDelegationPolicyMessage(
      policy,
      "https://example.test",
    );
    expect(message).toContain('"allowedMethods":["0xaaaaaaaa","0xbbbbbbbb"]');
    expect(message).toContain('"allowedChainIds":[1,11155111]');
  });
});
