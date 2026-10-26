import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSolanaBalance,
  type SolanaBalance,
} from "@naculus/connect-core";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { useSolanaAccount } from "./useSolanaAccount";

export interface UseSolanaBalanceOptions {
  /** Defaults to the connected Solana account. */
  address?: string;
  /** Defaults to the client's `solanaRpcUrl`. */
  rpcUrl?: string;
  /** Milliseconds between refreshes. Off by default. */
  refreshInterval?: number;
}

export interface UseSolanaBalanceReturn {
  /** Null until a balance has actually been read. Never a fabricated zero. */
  balance: SolanaBalance | null;
  isFetching: boolean;
  error: Error | null;
  /** Absent when no RPC endpoint is configured — a different fact from a
   *  balance of zero, and the only one a caller can act on. */
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

/**
 * The SOL balance of the connected Solana account.
 *
 * `balance` stays null until a read succeeds. A zero placeholder while
 * loading, or after a failure, is a number a user reads as their balance.
 */
export function useSolanaBalance(
  options: UseSolanaBalanceOptions = {},
): UseSolanaBalanceReturn {
  const { client } = useWeb3();
  const { address: connectedAddress } = useSolanaAccount();
  const address = options.address ?? connectedAddress;
  const rpcUrl = options.rpcUrl ?? resolveClient(client)?.solanaRpcUrl ?? null;

  const [balance, setBalance] = useState<SolanaBalance | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Guards against a slow response for a previous address overwriting the
  // balance of the one now on screen.
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!address || !rpcUrl) {
      setBalance(null);
      return;
    }
    const generation = ++generationRef.current;
    setIsFetching(true);
    setError(null);
    try {
      const next = await getSolanaBalance(rpcUrl, address);
      if (generation !== generationRef.current) return;
      setBalance(next);
    } catch (err) {
      if (generation !== generationRef.current) return;
      // Cleared rather than left stale: a balance shown next to an error is
      // read as the current balance, and it is not.
      setBalance(null);
      setError(err instanceof Error ? err : new Error("Balance read failed"));
    } finally {
      if (generation === generationRef.current) setIsFetching(false);
    }
  }, [address, rpcUrl]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!options.refreshInterval || options.refreshInterval <= 0) return;
    const id = setInterval(() => void refetch(), options.refreshInterval);
    return () => clearInterval(id);
  }, [options.refreshInterval, refetch]);

  return {
    balance,
    isFetching,
    error,
    isConfigured: Boolean(rpcUrl),
    refetch,
  };
}
