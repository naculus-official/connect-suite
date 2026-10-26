import { computed, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { useAccounts, type AccountEntry } from "./useAccounts";

export interface UseAccountReturn {
  accounts: ComputedRef<AccountEntry[] | null>;
  evmAccount: ComputedRef<string | null>;
  primaryAccount: ComputedRef<string | null>;
  isConnected: ComputedRef<boolean>;
  count: ComputedRef<number>;
}

/** React useAccount's connected-state view of the shared account parser. */
export function useAccount(
  accounts: MaybeRefOrGetter<string[] | null | undefined>,
  connected: MaybeRefOrGetter<boolean>,
): UseAccountReturn {
  const parsed = useAccounts(accounts);
  const isConnected = computed(() => toValue(connected));
  const accountList = computed(() => toValue(accounts) ?? []);

  return {
    accounts: computed(() =>
      isConnected.value && accountList.value.length > 0
        ? parsed.accounts.value
        : null,
    ),
    evmAccount: computed(() =>
      isConnected.value ? parsed.evmAccount.value : null,
    ),
    primaryAccount: computed(() => accountList.value[0] ?? null),
    isConnected,
    count: computed(() => accountList.value.length),
  };
}
