import { computed, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";

export interface UseSolanaAccountReturn {
  address: ComputedRef<string | null>;
  caip10: ComputedRef<string | null>;
  chainId: ComputedRef<string | null>;
  isConnected: ComputedRef<boolean>;
}

/** Read the connected Solana CAIP-10 account from any wallet. */
export function useSolanaAccount(
  accounts: MaybeRefOrGetter<string[] | null | undefined>,
  connected: MaybeRefOrGetter<boolean>,
): UseSolanaAccountReturn {
  const isConnected = computed(() => toValue(connected));
  const caip10 = computed(() =>
    isConnected.value
      ? ((toValue(accounts) ?? []).find((account) =>
          account.startsWith("solana:"),
        ) ?? null)
      : null,
  );
  const parts = computed(() => caip10.value?.split(":") ?? []);
  return {
    address: computed(() =>
      parts.value.length >= 3 ? (parts.value.at(-1) ?? null) : null,
    ),
    caip10,
    chainId: computed(() =>
      parts.value.length >= 3 ? parts.value.slice(0, -1).join(":") : null,
    ),
    isConnected,
  };
}
