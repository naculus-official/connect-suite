import { useMemo } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";

export interface UseSolanaAccountReturn {
  /** The bare base58 address, or null when no Solana account is connected. */
  address: string | null;
  /** The CAIP-10 form, which carries which cluster it is on. */
  caip10: string | null;
  /** The CAIP-2 cluster, e.g. `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. */
  chainId: string | null;
  isConnected: boolean;
}

/**
 * The connected Solana account, whichever wallet supplied it.
 *
 * Read off the session's namespaces rather than from the embedded connector,
 * so an injected wallet (Phantom, Solflare) and the embedded wallet answer the
 * same way.
 *
 * Matched on the `solana:` namespace, never on address shape. A base58 string
 * is not distinguishable from other base58 strings by inspection, and guessing
 * would eventually call something a Solana address that is not one.
 */
export function useSolanaAccount(): UseSolanaAccountReturn {
  const { accounts, isConnected } = useWeb3();

  return useMemo(() => {
    if (!isConnected) {
      return { address: null, caip10: null, chainId: null, isConnected: false };
    }
    const caip10 = accounts.find((a) => a.startsWith("solana:")) ?? null;
    if (!caip10) {
      return { address: null, caip10: null, chainId: null, isConnected };
    }
    // `solana:<reference>:<address>` — the address is the last segment and the
    // reference may itself contain no colon, so splitting from the end is safe.
    const parts = caip10.split(":");
    const address = parts.length >= 3 ? parts[parts.length - 1] : null;
    const chainId = parts.length >= 3 ? parts.slice(0, -1).join(":") : null;
    return { address, caip10, chainId, isConnected };
  }, [accounts, isConnected]);
}
