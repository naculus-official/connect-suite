import { buildDelegationPolicyMessage } from "@naculus/connect-appkit-core";
import {
  DELEGATION_FRAMEWORK,
  MemoryStorageAdapter,
  SessionKeyManager,
} from "@naculus/connect-core";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useDelegationPolicy } from "./useDelegationPolicy";

const SIGNER = "0x2222222222222222222222222222222222222222" as const;
const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const SIG = `0x${"11".repeat(65)}` as const;

describe("useDelegationPolicy (Vue)", () => {
  it("creates a verified policy through caller-owned signer/verifier and lists it as active", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const signMessage = vi.fn(async () => SIG);
    const connected = ref(true);
    const { api } = inScope(() =>
      useDelegationPolicy({
        account: `eip155:1:${SIGNER}`,
        connected,
        signMessage,
        verifySignature: async ({ signerAddress }) => signerAddress === SIGNER,
        previewExecution: () => ({
          strategy: "sequential",
          atomic: false,
          sponsored: false,
          reason: "plan",
          route: "sequential",
        }),
        delegation: { delegated: null, delegate: null },
        managerConfig: { encryptionKey: "k" },
        manager,
        origin: "https://app.test",
      }),
    );

    const policy = await api.createPolicy({ allowedContracts: [CONTRACT], rails: ["transfer"] });
    expect(signMessage).toHaveBeenCalledWith(
      buildDelegationPolicyMessage(policy, "https://app.test"),
    );
    await vi.waitFor(() => expect(api.activePolicies.value).toHaveLength(1));
    expect(api.loading.value).toBe(false);
    expect(api.isBusy.value).toBe(false);

    const preview = await api.previewPolicyExecution(policy.id, {
      to: CONTRACT,
    });
    expect(preview.ready).toBe(true);

    await api.revokePolicy(policy.id);
    await vi.waitFor(() => expect(api.activePolicies.value).toHaveLength(0));
  });

  it("surfaces a refused creation without invoking the signer", async () => {
    const signMessage = vi.fn(async () => SIG);
    const { api } = inScope(() =>
      useDelegationPolicy({
        account: null,
        connected: true,
        signMessage,
        verifySignature: async () => true,
        previewExecution: () => ({
          strategy: "refuse",
          atomic: false,
          sponsored: false,
          reason: "no",
          route: null,
        }),
        delegation: { delegated: null, delegate: null },
        managerConfig: { encryptionKey: "k" },
        manager: new SessionKeyManager(
          {
            pbkdf2Iterations: 1_000,
            unsafeAllowWeakKdf: true,
            encryptionKey: "k",
          },
          new MemoryStorageAdapter(),
        ),
      }),
    );
    await expect(
      api.createPolicy({ allowedContracts: [CONTRACT], rails: ["transfer"] }),
    ).rejects.toMatchObject({
      code: "wallet_unavailable",
    });
    expect(signMessage).not.toHaveBeenCalled();
    expect(api.error.value).toMatchObject({ code: "wallet_unavailable" });
    api.clearError();
    expect(api.error.value).toBeNull();
  });

  it("creates an eip7702 policy with the caller's typed-data signer and chain", async () => {
    const owner = privateKeyToAccount(`0x${"42".repeat(32)}`);
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const signTypedData = vi.fn(async (typed: { message: { salt: string } }) =>
      owner.signTypedData({
        ...typed,
        message: { ...typed.message, salt: BigInt(typed.message.salt) },
      } as never),
    );
    const chainId = ref<number | null>(8453);
    const { api } = inScope(() =>
      useDelegationPolicy({
        account: `eip155:8453:${owner.address}`,
        connected: true,
        signMessage: async () => SIG,
        verifySignature: async () => true,
        previewExecution: () => ({
          strategy: "sequential",
          atomic: false,
          sponsored: false,
          reason: "plan",
          route: "sequential",
        }),
        delegation: {
          delegated: true,
          delegate: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator,
        },
        managerConfig: { encryptionKey: "k" },
        manager,
        origin: "https://app.test",
        signTypedData,
        chainId,
      }),
    );
    const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
    const policy = await api.createPolicy({
      mode: "eip7702",
      allowedContracts: [USDC],
      allowedMethods: ["0xa9059cbb"],
      tokenAllowances: { [USDC]: 1_000n },
      rails: ["transfer"],
    });
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(policy.authorized).toBe(true);
    await vi.waitFor(() => expect(api.activePolicies.value).toHaveLength(1));

    // The chain is read at call time from the caller's ref.
    chainId.value = null;
    await expect(
      api.createPolicy({
        mode: "eip7702",
        allowedContracts: [USDC],
        allowedMethods: ["0xa9059cbb"],
        tokenAllowances: { [USDC]: 1_000n },
        rails: ["transfer"],
      }),
    ).rejects.toMatchObject({ code: "wallet_unavailable" });
  });
});
