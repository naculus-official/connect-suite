"use client";

import {
  bareEvmAddress,
  createDelegationPolicyFlow,
  type DelegationPolicyPreview,
  type DelegationTypedData,
  isVerifiablePolicy,
  type PolicyExecutionAdapter,
  type PolicyExecutionCheck,
  type PolicyExecutionRoute,
  type PolicyExecutionSubmission,
  type PreparedPolicyExecution,
} from "@naculus/connect-appkit-core";
import type {
  AtomicityRequirement,
  SessionKeyInfo,
  SessionKeyManagerConfig,
  SessionKeyScope,
  SessionKeyTransaction,
} from "@naculus/connect-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { recoverMessageAddress } from "viem";
import { useAccount } from "./useAccount";
import { useDelegation } from "./useDelegation";
import {
  type UseExecuteCallsOptions,
  useExecuteCalls,
} from "./useExecuteCalls";
import { getSessionKeyManagerForHooks, useSessionKeys } from "./useSessionKeys";
import { useSignMessage } from "./useSignMessage";

// The decisions — message format, verification, create/preview/sign/execute
// ordering and every refusal — live in appkit-core (delegation-policy.ts),
// shared with the Vue composable. This file wires them to React state and
// the provider hooks.
export { buildDelegationPolicyMessage } from "@naculus/connect-appkit-core";
export type {
  DelegationPolicyPreview,
  PolicyExecutionAdapter,
  PolicyExecutionCheck,
  PolicyExecutionRoute,
  PolicyExecutionSubmission,
  PreparedPolicyExecution,
};

export interface UseDelegationPolicyOptions {
  /** Must include a host-provided encryptionKey before a policy can be created. */
  managerConfig?: SessionKeyManagerConfig;
  execution?: UseExecuteCallsOptions;
  /** Domain shown in the signed policy. Defaults to the browser origin. */
  origin?: string;
  /** Concrete AA-module or EIP-7702 executor for promptless submissions. */
  adapter?: PolicyExecutionAdapter;
  /**
   * For `eip7702` policies: the wallet's EIP-712 signer. `message.salt` is a
   * decimal string (JSON-safe, as `eth_signTypedData_v4` takes it); for viem's
   * `signTypedData`, pass `{ ...t, message: { ...t.message, salt: BigInt(t.message.salt) } }`.
   */
  signTypedData?: (typedData: DelegationTypedData) => Promise<string>;
  /** For `eip7702` policies: the connected EVM chain number. */
  chainId?: number | null;
}

export interface UseDelegationPolicyReturn {
  policies: SessionKeyInfo[];
  /** Active policies whose persisted signature still verifies. */
  activePolicies: SessionKeyInfo[];
  storageAvailable: boolean;
  loading: boolean;
  isBusy: boolean;
  error: Error | null;
  delegation: ReturnType<typeof useDelegation>;
  createPolicy: (scope: Partial<SessionKeyScope>) => Promise<SessionKeyInfo>;
  revokePolicy: (policyId: string) => Promise<void>;
  previewPolicyExecution: (
    policyId: string,
    tx: SessionKeyTransaction,
    callCount?: number,
    atomicity?: AtomicityRequirement,
  ) => Promise<DelegationPolicyPreview>;
  /**
   * Sign one 32-byte execution digest after enforcing the persisted policy.
   * This returns a signature only; an AA/7702 adapter must still broadcast it.
   */
  signPolicyDigest: (
    policyId: string,
    digest: `0x${string}`,
    tx: SessionKeyTransaction,
  ) => Promise<`0x${string}`>;
  /** Prepare, policy-check, session-sign, and submit one exact operation. */
  executePolicy: (
    policyId: string,
    tx: SessionKeyTransaction,
  ) => Promise<PolicyExecutionSubmission>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

/**
 * Complete product flow for local, signed, persistent session policies.
 *
 * This intentionally supports `offchain` mode only. Creating an EIP-7702 or
 * AA-module policy requires a real on-chain executor; accepting those modes
 * here would turn a local record into a false delegation claim.
 */
export function useDelegationPolicy(
  options: UseDelegationPolicyOptions = {},
): UseDelegationPolicyReturn {
  const { evmAccount } = useAccount();
  const signer = bareEvmAddress(evmAccount);
  const delegation = useDelegation();
  const execution = useExecuteCalls(options.execution);
  const { signMessage } = useSignMessage();
  const sessionKeys = useSessionKeys(options.managerConfig);
  const manager = getSessionKeyManagerForHooks(options.managerConfig);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [verifiedPolicyIds, setVerifiedPolicyIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isVerifying, setIsVerifying] = useState(false);

  const policyOrigin =
    options.origin ??
    (typeof window !== "undefined" ? window.location.origin : "unknown");
  const encryptionKeyConfigured = Boolean(options.managerConfig?.encryptionKey);
  const sponsorship = options.execution?.sponsorship;
  const { refresh, storageAvailable } = sessionKeys;
  const { preview } = execution;
  const { delegated, delegate } = delegation;

  const flow = useMemo(
    () =>
      createDelegationPolicyFlow({
        manager,
        origin: policyOrigin,
        signer: () => signer,
        signMessage,
        verifySignature: async ({ message, signature, signerAddress }) => {
          const recovered = await recoverMessageAddress({ message, signature });
          return recovered.toLowerCase() === signerAddress.toLowerCase();
        },
        previewExecution: preview,
        sponsorship,
        adapter: options.adapter,
        signTypedData: options.signTypedData,
        chainId: () => options.chainId ?? null,
        delegation: () => ({ delegated, delegate }),
        encryptionKeyConfigured,
        storageAvailable: () => storageAvailable,
        refresh,
      }),
    [
      manager,
      policyOrigin,
      signer,
      signMessage,
      preview,
      sponsorship,
      options.adapter,
      options.signTypedData,
      options.chainId,
      delegated,
      delegate,
      encryptionKeyConfigured,
      storageAvailable,
      refresh,
    ],
  );

  // Verify every candidate policy whenever the list changes; a stale
  // verification for a previous list must not mark the current one.
  useEffect(() => {
    let cancelled = false;
    const candidates = sessionKeys.sessions.filter(isVerifiablePolicy);
    if (candidates.length === 0) {
      setVerifiedPolicyIds(new Set());
      setIsVerifying(false);
      return () => {
        cancelled = true;
      };
    }
    setIsVerifying(true);
    void Promise.all(
      candidates.map(
        async (policy) =>
          [policy.id, await flow.verifyStoredPolicy(policy)] as const,
      ),
    )
      .then((results) => {
        if (!cancelled) {
          setVerifiedPolicyIds(
            new Set(
              results
                .filter(([, verified]) => verified)
                .map(([policyId]) => policyId),
            ),
          );
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setVerifiedPolicyIds(new Set());
          setError(
            cause instanceof Error
              ? cause
              : new Error("Policy verification failed"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKeys.sessions, flow]);

  const clearError = useCallback(() => {
    setError(null);
    sessionKeys.clearError();
  }, [sessionKeys]);

  /** Busy/error state around a flow step; the error is rethrown as before. */
  const track = useCallback(
    async <T>(step: () => Promise<T>, fallback: string): Promise<T> => {
      setIsBusy(true);
      setError(null);
      try {
        return await step();
      } catch (cause) {
        const next = cause instanceof Error ? cause : new Error(fallback);
        setError(next);
        throw next;
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const createPolicy = useCallback(
    (scope: Partial<SessionKeyScope>) =>
      track(() => flow.createPolicy(scope), "Policy creation failed"),
    [flow, track],
  );
  const revokePolicy = useCallback(
    (policyId: string) =>
      track(() => flow.revokePolicy(policyId), "Policy revocation failed"),
    [flow, track],
  );
  const executePolicy = useCallback(
    (policyId: string, tx: SessionKeyTransaction) =>
      track(() => flow.executePolicy(policyId, tx), "Policy execution failed"),
    [flow, track],
  );

  const activePolicies = sessionKeys.activeSessions.filter((policy) =>
    verifiedPolicyIds.has(policy.id),
  );

  return {
    policies: sessionKeys.sessions,
    activePolicies,
    storageAvailable: sessionKeys.storageAvailable,
    loading: sessionKeys.loading || isVerifying,
    isBusy,
    error: error ?? sessionKeys.error,
    delegation,
    createPolicy,
    revokePolicy,
    previewPolicyExecution: flow.previewPolicyExecution,
    signPolicyDigest: flow.signPolicyDigest,
    executePolicy,
    refresh: sessionKeys.refresh,
    clearError,
  };
}
