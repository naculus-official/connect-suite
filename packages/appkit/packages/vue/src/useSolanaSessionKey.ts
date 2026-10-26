import {
  createSolanaSessionKeyFlow,
  type SolanaSessionKeyFlow,
  type SolanaSessionKeyFlowDeps,
} from "@naculus/connect-appkit-core";
import type {
  SolanaSessionKeyInfo,
  SolanaSessionKeyScope,
} from "@naculus/connect-core";
import type { MaybeRef, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, unref, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseSolanaSessionKeyReturn {
  /** The connected owner's keys, newest first. */
  keys: ShallowRef<SolanaSessionKeyInfo[]>;
  /** Create a key; the owner's wallet approves it once. */
  create: (
    scope: SolanaSessionKeyScope,
  ) => Promise<{ key: SolanaSessionKeyInfo; signature: string }>;
  /** Stop a key; the owner's wallet signs the on-chain Revoke. */
  revoke: (id: string) => Promise<{ signature: string }>;
  refresh: () => Promise<void>;
  isPending: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
}

/**
 * Solana session keys that pay x402 / MPP without a prompt (pass
 * `{ sessionKey: { manager, id }, rpc }` to the paying fetch). The app owns
 * the `SolanaSessionKeyManager` and the RPC; `owner` is the connected
 * wallet's Solana signer role.
 */
export function useSolanaSessionKey(
  deps: MaybeRef<SolanaSessionKeyFlowDeps | null>,
): UseSolanaSessionKeyReturn {
  const guard = useActionGuard();
  const keys = shallowRef<SolanaSessionKeyInfo[]>([]);
  let flow: SolanaSessionKeyFlow | null = null;
  let generation = 0;
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });

  const refresh = async () => {
    const own = ++generation;
    const next = flow ? await flow.list() : [];
    if (!disposed && own === generation) keys.value = next;
  };

  watch(
    () => unref(deps),
    (next) => {
      flow = next ? createSolanaSessionKeyFlow(next) : null;
      guard.invalidate();
      void refresh().catch(() => {});
    },
    { immediate: true },
  );

  const unavailable = () =>
    Promise.reject(new Error("No Solana session key manager is connected"));

  const act = <T>(
    action: (f: SolanaSessionKeyFlow) => Promise<T>,
    fallback: string,
  ) => {
    const current = flow;
    if (!current) return unavailable() as Promise<T>;
    return guard.run(async () => {
      try {
        return await action(current);
      } finally {
        // Show the stored state whatever happened (a failed create is
        // revoked, a revoke is local at once).
        await refresh().catch(() => {});
      }
    }, fallback);
  };

  return {
    keys,
    create: (scope) => act((f) => f.create(scope), "Could not create the key"),
    revoke: (id) => act((f) => f.revoke(id), "Could not revoke the key"),
    refresh,
    isPending: guard.busy,
    error: guard.error,
  };
}
