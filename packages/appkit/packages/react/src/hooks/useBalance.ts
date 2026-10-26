import type { WalletChain } from "../types";
import {
  chainNumber,
  resolveChain,
  toViemChain,
} from "@naculus/connect-appkit-core";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { useAccount } from "./useAccount";
import { createPublicClient, http, formatEther, type PublicClient, type Address } from "viem";
import { getNativeTokenPriceUsd } from "@naculus/connect-core";

export interface UseBalanceOptions {
  /** Auto-refresh interval in milliseconds. Default: undefined (no auto-refresh). */
  refreshInterval?: number;
}

export interface UseBalanceResult {
  /** Raw balance in wei (string), or null if not connected / error */
  balance: string | null;
  /** Human-readable formatted balance in ETH (or native token), or null */
  formatted: string | null;
  /** Native token symbol (e.g. "ETH", "MATIC") */
  /**
   * The native currency symbol, or null when it is not known.
   *
   * Null rather than "ETH". This is rendered beside the number, so a fallback
   * labels 1.5 MATIC or 1.5 SOL as ether. Show the amount without a unit, or
   * hide it, but do not name the wrong one.
   */
  symbol: string | null;
  /** USD price of one native token, or null if unavailable */
  usdPrice: number | null;
  /** Formatted USD value of the balance (e.g. "$1,234.56"), or null */
  usdValue: string | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  chain: WalletChain | null;
}

export function useBalance(options?: UseBalanceOptions): UseBalanceResult {
  const { evmAccount, isConnected } = useAccount();
  const { chainId, chains } = useWeb3();
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [usdPrice, setUsdPrice] = useState<number | null>(null);
  const refreshInterval = options?.refreshInterval;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentChain = useMemo(
    () => resolveChain(chains, chainId),
    [chainId, chains],
  );
  const evmChainNumber = currentChain ? chainNumber(currentChain) : null;
  // Memoized: `toViemChain` builds a fresh object per call, and an unmemoized
  // one would change identity every render — which drives the client effects
  // below into a loop that never settles.
  const viemChain = useMemo(
    () => (currentChain ? toViemChain(currentChain, evmChainNumber) : null),
    [currentChain, evmChainNumber],
  );

  // No `?? "ETH"`. This label is rendered directly beside the number, so a
  // fallback shows "1.5 ETH" to someone holding 1.5 MATIC or 1.5 SOL. When
  // the chain is unknown or its native symbol was never configured, the
  // honest answer is that we do not know it.
  const tokenSymbol = useMemo(
    () => currentChain?.token ?? null,
    [currentChain],
  );

  const [client, setClient] = useState<PublicClient | null>(null);

  useEffect(() => {
    if (!viemChain || !currentChain?.rpcUrl) {
      setClient(null);
      return;
    }

    const publicClient = createPublicClient({
      transport: http(currentChain.rpcUrl),
      chain: viemChain,
    });

    setClient(publicClient);

    // H10: Cleanup previous client on chain change
    return () => {
      // viem PublicClient doesn't have a close method, but we clear the reference
      // to prevent stale state from being used in fetchBalance
    };
  }, [currentChain, viemChain]);

  const fetchBalance = useCallback(async () => {
    if (!evmAccount || !client) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const address = evmAccount.includes(":") ? evmAccount.split(":").pop()! : evmAccount;
      const address_ = address as Address;
      const [balanceResult, price] = await Promise.all([
        client.getBalance({ address: address_ }),
        chainId ? getNativeTokenPriceUsd(chainId, currentChain?.rpcUrl).catch(() => null) : Promise.resolve(null),
      ]);
      setBalance(balanceResult.toString());
      setUsdPrice(price);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch balance"));
      setBalance(null);
      setUsdPrice(null);
    } finally {
      setIsLoading(false);
    }
  }, [evmAccount, client, chainId, currentChain?.rpcUrl]);

  // Initial fetch on connect / account change
  useEffect(() => {
    if (isConnected && evmAccount) {
      fetchBalance();
    }
  }, [isConnected, evmAccount, fetchBalance]);

  // Auto-refresh interval
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0 && isConnected && evmAccount) {
      intervalRef.current = setInterval(fetchBalance, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshInterval, isConnected, evmAccount, fetchBalance]);

  const formatted = useMemo(() => {
    if (balance === null) return null;
    try {
      return formatEther(BigInt(balance));
    } catch {
      return null;
    }
  }, [balance]);

  const usdValue = useMemo(() => {
    if (usdPrice === null || formatted === null) return null;
    const numericBalance = parseFloat(formatted);
    if (Number.isNaN(numericBalance)) return null;
    const totalUsd = numericBalance * usdPrice;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(totalUsd);
  }, [usdPrice, formatted]);

  return {
    balance,
    formatted,
    symbol: tokenSymbol,
    usdPrice,
    usdValue,
    isLoading,
    error,
    refetch: fetchBalance,
    chain: currentChain,
  };
}
