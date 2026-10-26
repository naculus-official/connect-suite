import {
  createX402WalletSigner,
  type X402Eip1193Provider,
  type X402SignerUnavailableReason,
  type X402TypedDataSigner,
} from "@naculus/connect-appkit-core";
import type { UniversalWalletSession } from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter } from "vue";
import { computed, toValue, unref } from "vue";

export interface UseX402SignerReturn {
  signer: ComputedRef<X402TypedDataSigner | null>;
  reason: ComputedRef<X402SignerUnavailableReason | null>;
}

/** Vue shell over the caller-owned session, provider and chain switch path. */
export function useX402Signer(
  session: MaybeRefOrGetter<UniversalWalletSession | null | undefined>,
  provider: MaybeRefOrGetter<X402Eip1193Provider | null | undefined>,
  switchChain: MaybeRef<(chainId: string) => Promise<void>>,
  chainId: MaybeRefOrGetter<string | null | undefined>,
): UseX402SignerReturn {
  const resolved = computed(() => {
    // Reading the chain makes a wallet event rebuild the signer even when a
    // SessionManager mutates the session object in place.
    toValue(chainId);
    return createX402WalletSigner(
      toValue(session),
      toValue(provider),
      unref(switchChain),
    );
  });
  return {
    signer: computed(() => resolved.value.signer),
    reason: computed(() => resolved.value.reason),
  };
}
