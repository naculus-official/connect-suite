/**
 * The viem `Chain` shape for a configured EVM chain.
 *
 * Three hooks each built this inline — `useBalance`, `useTokenBalance` and
 * `useViemClient` — with identical bodies and the same `?? "ETH"` in each.
 * Three copies of a fallback is three places for it to be wrong.
 *
 * Returns a plain object rather than importing viem, so this package stays
 * free of a dependency only the React bindings need. The shape satisfies
 * viem's `Chain` structurally.
 */

import { CHAINS } from "@naculus/connect-core";
import type { WalletChain } from "./types";

export interface ViemChainShape {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: {
    default: { http: string[] };
    public: { http: string[] };
  };
}

/**
 * Build the chain descriptor a viem client needs, or null when this chain is
 * not one viem can talk to.
 *
 * Null for a non-EVM chain rather than a stand-in number: viem speaks to EVM
 * nodes, and any number chosen to fill the gap addresses a real chain that is
 * not the one connected.
 *
 * The native symbol comes from the chain's own `token`, then from the shared
 * chain registry. For an unlisted chain it stays empty rather than claiming
 * the asset is ETH. viem requires a string here; the user-facing symbol comes
 * from `useBalance().symbol`, which stays null when it is unknown.
 */
export function toViemChain(
  chain: WalletChain,
  chainNumber: number | null,
): ViemChainShape | null {
  if (chainNumber === null || !chain.rpcUrl) return null;

  const symbol =
    chain.token ?? CHAINS[chainNumber]?.nativeCurrency?.symbol ?? "";

  return {
    id: chainNumber,
    name: chain.name,
    // Every EIP-155 native currency is 18 decimals by protocol, so this is a
    // constant rather than an assumption. ERC-20 decimals are per-token and
    // are never guessed anywhere in this codebase.
    nativeCurrency: { name: symbol, symbol, decimals: 18 },
    rpcUrls: {
      default: { http: [chain.rpcUrl] },
      public: { http: [chain.rpcUrl] },
    },
  };
}
