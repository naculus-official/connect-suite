import {
  atomicSupportFor,
  type AtomicSupport,
  type ChainCapabilities,
  normalizeCapabilities,
  selectChainCapabilities,
} from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";

// `AtomicSupport` and `ChainCapabilities` are re-exported rather than declared
// here: Vue needs the same two, and a second declaration of "three values, not
// two" is the one that quietly becomes two.
export type { AtomicSupport, ChainCapabilities };

export interface UseCapabilitiesReturn {
  /** Per-chain, keyed by CAIP-2. Null until a query has actually returned. */
  capabilities: Record<string, ChainCapabilities> | null;
  /** The connected chain's entry, for the common case. */
  current: ChainCapabilities | null;
  /**
   * Atomic support on the connected chain.
   *
   * `"unknown"` while loading, when the wallet does not implement the method,
   * and when the query failed — all three are "we have not been told", and a
   * caller deciding between an atomic and a sequential path needs to know that
   * rather than be handed a confident `false`.
   */
  atomic: AtomicSupport;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * What the connected wallet says it can do — EIP-5792
 * `wallet_getCapabilities`.
 *
 * This is the query a dApp makes *before* choosing how to execute: ask whether
 * the wallet batches atomically, then send one batch or a sequence, rather
 * than sending a batch and discovering the answer from a rejection.
 */
export function useCapabilities(): UseCapabilitiesReturn {
  const { client, session, chainId } = useWeb3();
  const [capabilities, setCapabilities] = useState<Record<
    string,
    ChainCapabilities
  > | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Guards a slow answer for a previous session overwriting a newer one.
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    const generation = ++generationRef.current;
    const activeClient = resolveClient(client);
    if (!activeClient?.getCapabilities || !session) {
      setCapabilities(null);
      setIsFetching(false);
      setError(null);
      return;
    }
    setIsFetching(true);
    setError(null);
    try {
      const raw = await activeClient.getCapabilities(session);
      if (generation !== generationRef.current) return;
      setCapabilities(normalizeCapabilities(raw as Record<string, unknown>));
    } catch (err) {
      if (generation !== generationRef.current) return;
      // Cleared rather than left stale. A capability map from a previous
      // wallet is a worse answer than no answer.
      setCapabilities(null);
      setError(
        err instanceof Error ? err : new Error("Capability query failed"),
      );
    } finally {
      if (generation === generationRef.current) setIsFetching(false);
    }
  }, [client, session]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    capabilities,
    current: selectChainCapabilities(capabilities, chainId),
    atomic: atomicSupportFor(capabilities, chainId),
    isFetching,
    error,
    refetch,
  };
}
