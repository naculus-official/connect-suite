import {
  bareEvmAddress,
  createDelegationPolicyFlow,
  type DelegationPolicyPreview,
  type DelegationTypedData,
  getSharedSessionKeyManager,
  isVerifiablePolicy,
  type PolicyExecutionAdapter,
  type PolicyExecutionPreview,
  type PolicyExecutionSubmission,
  type PolicySignatureVerifier,
} from "@naculus/connect-appkit-core";
import type {
  AtomicityRequirement,
  SessionKeyInfo,
  SessionKeyManager,
  SessionKeyManagerConfig,
  SessionKeyScope,
  SessionKeyTransaction,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import {
  computed,
  onScopeDispose,
  shallowRef,
  toValue,
  unref,
  watch,
} from "vue";
import { useActionGuard } from "./internal/action-guard";
import { useSessionKeys } from "./useSessionKeys";

export type {
  DelegationPolicyPreview,
  PolicyExecutionAdapter,
  PolicyExecutionSubmission,
};

export interface UseDelegationPolicyOptions {
  /** Connected EOA (plain or CAIP-10). */
  account: MaybeRefOrGetter<string | null | undefined>;
  /** Whether a wallet session is connected (gates the policy list). */
  connected: MaybeRefOrGetter<boolean>;
  /** Main-wallet EIP-191 signer for the policy message. */
  signMessage: MaybeRef<(message: string) => Promise<string>>;
  /** Recovers an EIP-191 signer and compares; e.g. viem's recoverMessageAddress. */
  verifySignature: MaybeRef<PolicySignatureVerifier>;
  /** Execution planner (from useExecuteCalls-style preview) for readiness. */
  previewExecution: MaybeRef<
    (
      callCount: number,
      atomicity: AtomicityRequirement,
    ) => PolicyExecutionPreview
  >;
  /** Current on-chain EIP-7702 delegation of the account (from useDelegation). */
  delegation: MaybeRefOrGetter<{
    delegated: boolean | null;
    delegate: `0x${string}` | null;
  }>;
  managerConfig?: SessionKeyManagerConfig;
  /** Reuse a caller-owned manager instead of the shared one. */
  manager?: SessionKeyManager;
  origin?: string;
  sponsorship?: AtomicityRequirement;
  adapter?: PolicyExecutionAdapter;
  /**
   * For `eip7702` policies: the wallet's EIP-712 signer. `message.salt` is a
   * decimal string (JSON-safe, as `eth_signTypedData_v4` takes it); for viem's
   * `signTypedData`, pass `{ ...t, message: { ...t.message, salt: BigInt(t.message.salt) } }`.
   */
  signTypedData?: MaybeRef<(typedData: DelegationTypedData) => Promise<string>>;
  /** For `eip7702` policies: the connected EVM chain number. */
  chainId?: MaybeRefOrGetter<number | null>;
}

export interface UseDelegationPolicyReturn {
  policies: ShallowRef<SessionKeyInfo[]>;
  /** Active policies whose stored signature currently verifies. */
  activePolicies: ComputedRef<SessionKeyInfo[]>;
  storageAvailable: boolean;
  loading: ComputedRef<boolean>;
  isBusy: ShallowRef<boolean>;
  error: ComputedRef<Error | null>;
  createPolicy: (scope: Partial<SessionKeyScope>) => Promise<SessionKeyInfo>;
  revokePolicy: (policyId: string) => Promise<void>;
  previewPolicyExecution: (
    policyId: string,
    tx: SessionKeyTransaction,
    callCount?: number,
    atomicity?: AtomicityRequirement,
  ) => Promise<DelegationPolicyPreview>;
  signPolicyDigest: (
    policyId: string,
    digest: `0x${string}`,
    tx: SessionKeyTransaction,
  ) => Promise<`0x${string}`>;
  executePolicy: (
    policyId: string,
    tx: SessionKeyTransaction,
  ) => Promise<PolicyExecutionSubmission>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Signed off-chain delegation policies in Vue. The whole flow is
 * appkit-core's createDelegationPolicyFlow, shared with React; this file
 * supplies reactivity and the caller-owned signer, verifier, planner and
 * delegation state that React gets from its provider.
 */
export function useDelegationPolicy(
  options: UseDelegationPolicyOptions,
): UseDelegationPolicyReturn {
  const manager =
    options.manager ?? getSharedSessionKeyManager(options.managerConfig);
  const sessionKeys = useSessionKeys(options.connected, options.managerConfig, {
    manager,
  });
  const guard = useActionGuard();
  const verifiedIds = shallowRef<Set<string>>(new Set());
  const isVerifying = shallowRef(false);
  const verifyError = shallowRef<Error | null>(null);
  let verifyGeneration = 0;
  let disposed = false;

  const origin =
    options.origin ??
    (typeof window !== "undefined" ? window.location.origin : "unknown");

  const flow = createDelegationPolicyFlow({
    manager,
    origin,
    signer: () => bareEvmAddress(toValue(options.account)),
    signMessage: (message) => unref(options.signMessage)(message),
    verifySignature: (input) => unref(options.verifySignature)(input),
    previewExecution: (callCount, atomicity) =>
      unref(options.previewExecution)(callCount, atomicity),
    sponsorship: options.sponsorship,
    adapter: options.adapter,
    signTypedData: options.signTypedData
      ? (typedData) =>
          unref(
            options.signTypedData as MaybeRef<
              (typedData: DelegationTypedData) => Promise<string>
            >,
          )(typedData)
      : undefined,
    chainId: () => toValue(options.chainId) ?? null,
    delegation: () => toValue(options.delegation),
    encryptionKeyConfigured: Boolean(options.managerConfig?.encryptionKey),
    storageAvailable: () => sessionKeys.storageAvailable,
    refresh: sessionKeys.refresh,
  });

  // Re-verify stored signatures whenever the list changes; a verification
  // for a previous list must not mark the current one.
  watch(
    () => sessionKeys.sessions.value,
    (sessions) => {
      const own = ++verifyGeneration;
      const candidates = sessions.filter(isVerifiablePolicy);
      if (candidates.length === 0) {
        verifiedIds.value = new Set();
        isVerifying.value = false;
        return;
      }
      isVerifying.value = true;
      void Promise.all(
        candidates.map(
          async (policy) =>
            [policy.id, await flow.verifyStoredPolicy(policy)] as const,
        ),
      )
        .then((results) => {
          if (disposed || own !== verifyGeneration) return;
          verifiedIds.value = new Set(
            results.filter(([, ok]) => ok).map(([id]) => id),
          );
        })
        .catch((cause) => {
          if (disposed || own !== verifyGeneration) return;
          verifiedIds.value = new Set();
          verifyError.value =
            cause instanceof Error
              ? cause
              : new Error("Policy verification failed");
        })
        .finally(() => {
          if (!disposed && own === verifyGeneration) isVerifying.value = false;
        });
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disposed = true;
    verifyGeneration++;
  });

  return {
    policies: sessionKeys.sessions,
    activePolicies: computed(() =>
      sessionKeys.activeSessions.value.filter((p) =>
        verifiedIds.value.has(p.id),
      ),
    ),
    storageAvailable: sessionKeys.storageAvailable,
    loading: computed(() => sessionKeys.loading.value || isVerifying.value),
    isBusy: guard.busy,
    error: computed(
      () => guard.error.value ?? verifyError.value ?? sessionKeys.error.value,
    ),
    createPolicy: (scope) =>
      guard.run(() => flow.createPolicy(scope), "Policy creation failed"),
    revokePolicy: (policyId) =>
      guard.run(() => flow.revokePolicy(policyId), "Policy revocation failed"),
    previewPolicyExecution: flow.previewPolicyExecution,
    signPolicyDigest: flow.signPolicyDigest,
    executePolicy: (policyId, tx) =>
      guard.run(
        () => flow.executePolicy(policyId, tx),
        "Policy execution failed",
      ),
    refresh: sessionKeys.refresh,
    clearError: () => {
      guard.reset();
      verifyError.value = null;
      sessionKeys.clearError();
    },
  };
}
