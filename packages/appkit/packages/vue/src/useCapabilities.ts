import {
  atomicSupportFor,
  type AtomicSupport,
  type ChainCapabilities,
  normalizeCapabilities,
  selectChainCapabilities,
} from "@naculus/connect-appkit-core";
import { computed, shallowRef, toValue, watchEffect } from "vue";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { useActionGuard } from "./internal/action-guard";

export type { AtomicSupport, ChainCapabilities };

/** The part of a connector this needs. Anything with these two is enough. */
export interface CapabilityClient {
  getCapabilities?: (session: unknown) => Promise<Record<string, unknown>>;
}

export interface UseCapabilitiesReturn {
  /** Per-chain, keyed by CAIP-2. Null until a query has actually returned. */
  capabilities: ShallowRef<Record<string, ChainCapabilities> | null>;
  /** The connected chain's entry, for the common case. */
  current: ComputedRef<ChainCapabilities | null>;
  /** Atomic support on the connected chain. `"unknown"` until told otherwise. */
  atomic: ComputedRef<AtomicSupport>;
  isFetching: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refetch: () => Promise<void>;
}

/**
 * What the connected wallet says it can do — EIP-5792
 * `wallet_getCapabilities`.
 *
 * The query a dApp makes *before* choosing how to execute: ask whether the
 * wallet batches atomically, then send one batch or a sequence, rather than
 * sending a batch and learning the answer from a rejection.
 *
 * Identical in substance to the React hook, because every decision in it —
 * normalizing the raw answer, the CAIP-2/hex lookup, and `"unknown"` meaning
 * "not told" rather than "no" — is in `@naculus/connect-appkit-core` and
 * neither binding gets to disagree about it.
 *
 * Takes its client, session and chain as arguments. Vue has no equivalent of
 * the React provider here, which is the same shape `useChain` uses.
 */
export function useCapabilities(
  client: MaybeRefOrGetter<CapabilityClient | null | undefined>,
  session: MaybeRefOrGetter<unknown>,
  chainId: MaybeRefOrGetter<string | null | undefined>,
): UseCapabilitiesReturn {
  // Guards a slow answer for a previous session overwriting a newer one.
  // isFetching stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const capabilities = shallowRef<Record<string, ChainCapabilities> | null>(
    null,
  );
  const isFetching = shallowRef(false);

  const refetch = async () => {
    const activeClient = toValue(client);
    const activeSession = toValue(session);
    if (!activeClient?.getCapabilities || !activeSession) {
      guard.reset();
      capabilities.value = null;
      isFetching.value = false;
      return;
    }
    isFetching.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            // Checked above; the closure does not keep the narrowing.
            const raw = await activeClient.getCapabilities!(activeSession);
            commit(() => {
              capabilities.value = normalizeCapabilities(raw);
            });
          } catch (err) {
            // Cleared rather than left stale. A capability map from a previous
            // wallet is a worse answer than no answer.
            commit(() => {
              capabilities.value = null;
            });
            throw err;
          }
        },
        "Capability query failed",
        undefined,
        {
          onSettled: () => {
            isFetching.value = false;
          },
        },
      )
      .catch(() => {});
  };

  // Re-queries when the client or session changes, the way the React effect
  // does. `chainId` is deliberately not a trigger: it selects from an answer
  // already held rather than needing a new one.
  watchEffect(() => {
    void toValue(client);
    void toValue(session);
    void refetch();
  });

  return {
    capabilities,
    current: computed(() =>
      selectChainCapabilities(capabilities.value, toValue(chainId)),
    ),
    atomic: computed(() =>
      atomicSupportFor(capabilities.value, toValue(chainId)),
    ),
    isFetching,
    error: guard.error,
    refetch,
  };
}
