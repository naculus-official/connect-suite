import {
  chainNamespace,
  chainNumber,
  chainsForNamespace,
  describeChain,
  resolveChain,
  type ChainInfo,
  type WalletChain,
} from "@naculus/connect-appkit-core";
import { computed, toValue } from "vue";
import type { ComputedRef, MaybeRefOrGetter } from "vue";

export interface UseChainReturn {
  /** The configured chain matching the connected CAIP-2 id, or null. */
  currentChain: ComputedRef<WalletChain | null>;
  /** A description of the connected chain, for any namespace. */
  chainInfo: ComputedRef<ChainInfo | null>;
  /** Only the chains the connected wallet could actually switch to. */
  availableChains: ComputedRef<WalletChain[]>;
  /** The EIP-155 number, or null when the connected chain has none. */
  currentChainNumber: ComputedRef<number | null>;
  namespace: ComputedRef<string | null>;
}

/**
 * The connected chain, and the chains it is possible to switch to.
 *
 * Identical in substance to the React `useChain`, because it is the same five
 * functions from `@naculus/connect-appkit-core`. This file contains no
 * decision at all — which is the point: `availableChains` filtering to the
 * connected namespace, `chainInfo` describing non-EVM chains, and
 * `currentChainNumber` refusing to invent a number for Solana are all
 * properties of the shared core, so both bindings get them or neither does.
 *
 * Takes its chain list and connected id as arguments; Vue has no equivalent of
 * the React provider here.
 */
export function useChain(
  chains: MaybeRefOrGetter<WalletChain[] | null | undefined>,
  chainId: MaybeRefOrGetter<string | null | undefined>,
): UseChainReturn {
  const list = computed(() => toValue(chains) ?? []);
  const id = computed(() => toValue(chainId) ?? null);

  const currentChain = computed(() => resolveChain(list.value, id.value));

  return {
    currentChain,
    chainInfo: computed(() => describeChain(list.value, id.value)),
    availableChains: computed(() => chainsForNamespace(list.value, id.value)),
    currentChainNumber: computed(() =>
      currentChain.value ? chainNumber(currentChain.value) : null,
    ),
    namespace: computed(() =>
      currentChain.value ? chainNamespace(currentChain.value) : null,
    ),
  };
}
