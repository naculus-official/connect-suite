import { getSolanaBalance, type SolanaBalance } from "@naculus/connect-core";
import { ref, shallowRef, toValue, watchEffect } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseSolanaBalanceReturn {
  balance: ReturnType<typeof shallowRef<SolanaBalance | null>>;
  isFetching: ReturnType<typeof ref<boolean>>;
  error: ReturnType<typeof shallowRef<Error | null>>;
  refetch: () => Promise<void>;
}

/**
 * The SOL balance of an address.
 *
 * The whole of this file is Vue plumbing. Every decision that took thought —
 * exact lamport arithmetic, distinguishing an unfunded account from an emptied
 * one, refusing to invent a zero — is in `@naculus/connect-core`, shared with
 * the React hook. That is what makes "author in React, ship to Vue" true for
 * the logic: what does not translate is only the reactivity.
 *
 * Takes its address and endpoint as arguments because Vue has no equivalent of
 * the React provider here. Refs and getters both work.
 */
export function useSolanaBalance(
  address: MaybeRefOrGetter<string | null | undefined>,
  rpcUrl: MaybeRefOrGetter<string | null | undefined>,
): UseSolanaBalanceReturn {
  // Guards against a slow response for a previous address overwriting the
  // balance of the one now on screen. isFetching stays newest-only (cleared
  // via onSettled), not the guard's counted busy flag.
  const guard = useActionGuard();
  const balance = shallowRef<SolanaBalance | null>(null);
  const isFetching = ref(false);

  const refetch = async () => {
    const addr = toValue(address);
    const url = toValue(rpcUrl);
    if (!addr || !url) {
      // Supersede any in-flight read so a late one cannot write the balance
      // back. The visible error is kept, as before.
      guard.invalidate();
      isFetching.value = false;
      balance.value = null;
      return;
    }
    isFetching.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            const next = await getSolanaBalance(url, addr);
            commit(() => {
              balance.value = next;
            });
          } catch (err) {
            // Cleared rather than left stale: a balance shown next to an error
            // reads as the current balance, and it is not.
            commit(() => {
              balance.value = null;
            });
            throw err;
          }
        },
        "Balance read failed",
        undefined,
        {
          onSettled: () => {
            isFetching.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watchEffect(() => {
    // Touch both so the effect re-runs when either changes.
    toValue(address);
    toValue(rpcUrl);
    void refetch();
  });

  return { balance, isFetching, error: guard.error, refetch };
}
