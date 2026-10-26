import {
  createSolanaSessionKeyFlow,
  type SolanaSessionKeyFlowDeps,
} from "@naculus/connect-appkit-core";
import type {
  SolanaSessionKeyInfo,
  SolanaSessionKeyScope,
} from "@naculus/connect-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function unavailable(): Promise<never> {
  return Promise.reject(
    new Error("No Solana session key manager is connected"),
  );
}

export interface UseSolanaSessionKeyReturn {
  /** The connected owner's keys, newest first. */
  keys: SolanaSessionKeyInfo[];
  /** Create a key; the owner's wallet approves it once. */
  create: (
    scope: SolanaSessionKeyScope,
  ) => Promise<{ key: SolanaSessionKeyInfo; signature: string }>;
  /** Stop a key; the owner's wallet signs the on-chain Revoke. */
  revoke: (id: string) => Promise<{ signature: string }>;
  refresh: () => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

/**
 * Solana session keys that pay x402 / MPP without a prompt (pass
 * `{ sessionKey: { manager, id }, rpc }` to the paying fetch). The app owns
 * the `SolanaSessionKeyManager` and the RPC; `owner` is the connected
 * wallet's Solana signer role. Keep `manager`, `rpc` and `owner` stable
 * (module scope or `useMemo`): a new object each render rebuilds the flow
 * and refetches the keys every render.
 */
export function useSolanaSessionKey(
  deps: SolanaSessionKeyFlowDeps | null,
): UseSolanaSessionKeyReturn {
  const [keys, setKeys] = useState<SolanaSessionKeyInfo[]>([]);
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const generationRef = useRef(0);
  const manager = deps?.manager;
  const rpc = deps?.rpc;
  const owner = deps?.owner;
  const flow = useMemo(
    () =>
      manager && rpc && owner
        ? createSolanaSessionKeyFlow({ manager, rpc, owner })
        : null,
    [manager, rpc, owner],
  );

  const run = useCallback(
    async <T>(action: () => Promise<T>, fallback: string): Promise<T> => {
      const own = ++generationRef.current;
      setInFlight((n) => n + 1);
      setError(null);
      try {
        return await action();
      } catch (cause) {
        const normalized = cause instanceof Error ? cause : new Error(fallback);
        if (own === generationRef.current) setError(normalized);
        throw normalized;
      } finally {
        // Whatever happened, show the stored state before settling (a failed
        // create is revoked, a revoke is local at once) — as the Vue shell.
        if (flow && own === generationRef.current) {
          const next = await flow.list().catch(() => null);
          if (next && own === generationRef.current) setKeys(next);
        }
        setInFlight((n) => n - 1);
      }
    },
    [flow],
  );

  const refresh = useCallback(async () => {
    if (!flow) {
      setKeys([]);
      return;
    }
    const own = generationRef.current;
    const next = await flow.list();
    if (own === generationRef.current) setKeys(next);
  }, [flow]);

  useEffect(() => {
    generationRef.current += 1;
    void refresh().catch(() => {});
    return () => {
      generationRef.current += 1;
    };
  }, [refresh]);

  const create = useCallback(
    (scope: SolanaSessionKeyScope) =>
      flow
        ? run(() => flow.create(scope), "Could not create the key")
        : unavailable(),
    [flow, run],
  );
  const revoke = useCallback(
    (id: string) =>
      flow
        ? run(() => flow.revoke(id), "Could not revoke the key")
        : unavailable(),
    [flow, run],
  );

  return { keys, create, revoke, refresh, isPending: inFlight > 0, error };
}
