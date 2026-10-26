import { isEvmAddress, parseCaip10 } from "@naculus/connect-core";
import { computed, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";

export interface AccountEntry {
  /** As the session reports it: CAIP-10 for most wallets, bare hex for some. */
  address: string;
  /** The namespace, when the entry was CAIP-10. Null for a bare address. */
  namespace: string | null;
  isEVM: boolean;
}

export interface UseAccountsReturn {
  accounts: ComputedRef<AccountEntry[]>;
  evmAccount: ComputedRef<string | null>;
  solanaAccount: ComputedRef<string | null>;
}

/**
 * Split a session's account list by what each entry actually is.
 *
 * The same reading as the React `useAccount`, because it is the same reading:
 * `parseCaip10` and `isEvmAddress` come from `@naculus/connect-core` and hold
 * every rule about which strings mean what. What differs between the two
 * bindings is `computed` versus `useMemo`, and nothing else.
 */
export function useAccounts(
  accounts: MaybeRefOrGetter<string[] | null | undefined>,
): UseAccountsReturn {
  const parsed = computed<AccountEntry[]>(() =>
    (toValue(accounts) ?? []).map((address) => {
      const caip10 = parseCaip10(address);
      if (caip10) {
        return {
          address,
          namespace: caip10.namespace,
          isEVM:
            caip10.namespace === "eip155" && isEvmAddress(caip10.address),
        };
      }
      // A bare 0x-40-hex value is unambiguously EVM. A bare base58 string is
      // not unambiguously anything, so nothing is claimed about it.
      return { address, namespace: null, isEVM: isEvmAddress(address) };
    }),
  );

  return {
    accounts: parsed,
    evmAccount: computed(
      () => parsed.value.find((a) => a.isEVM)?.address ?? null,
    ),
    solanaAccount: computed(
      () => parsed.value.find((a) => a.namespace === "solana")?.address ?? null,
    ),
  };
}
