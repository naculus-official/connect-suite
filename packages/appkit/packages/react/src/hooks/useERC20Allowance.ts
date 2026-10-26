import { chainNumber } from "@naculus/connect-appkit-core";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useViemClient } from "./useViemClient";
import { useChain } from "./useChain";
import { useERC20Context } from "./useERC20Context";
import { ERC20_MIN_ABI, formatUnits } from "@naculus/connect-core";
import type { TokenConfig } from "@naculus/connect-core";
import type { Address } from "viem";

// ── Types ─────────────────────────────────────────────────────────

export interface UseERC20AllowanceOptions {
  token: TokenConfig;
  owner: Address;
  spender: Address;
  refreshInterval?: number;
}

export interface UseERC20AllowanceReturn {
  allowance: string | null;
  allowanceRaw: bigint | null;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useERC20Allowance(
  options: UseERC20AllowanceOptions,
): UseERC20AllowanceReturn {
  const { publicClient } = useViemClient();
  const { currentChain } = useChain();
  const { identity, isCurrent, assertCurrent } = useERC20Context({
    token: options.token,
    chainId: currentChain ? (chainNumber(currentChain) ?? undefined) : undefined,
    owner: options.owner,
    spender: options.spender,
    publicClient,
  });
  const [read, setRead] = useState<{
    identity: object;
    raw: bigint | null;
    fetching: boolean;
    error: Error | null;
  } | null>(null);
  const allowanceRaw = read?.identity === identity ? read.raw : null;
  const isFetching = read?.identity === identity && read.fetching;
  const error = read?.identity === identity ? read.error : null;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: chainId keeps the callback per chain, so the refetch effect keyed on it runs when only the chain changes
  const fetchAllowance = useCallback(async () => {
    if (!isCurrent()) return;
    const generation = ++generationRef.current;
    const stillCurrent = () =>
      isCurrent() && generation === generationRef.current;
    setRead({ identity, raw: null, fetching: !!publicClient, error: null });
    if (!publicClient) return;
    try {
      assertCurrent();
      const raw = await publicClient.readContract({
        address: options.token.address,
        abi: ERC20_MIN_ABI,
        functionName: "allowance",
        args: [options.owner, options.spender],
      });
      if (!stillCurrent()) return;
      setRead({ identity, raw: raw as bigint, fetching: false, error: null });
    } catch (err) {
      if (!stillCurrent()) return;
      setRead({
        identity,
        raw: null,
        fetching: false,
        error:
          err instanceof Error ? err : new Error("Failed to fetch allowance"),
      });
    }
  }, [
    publicClient,
    options.token.address,
    options.token.chainId,
    options.owner,
    options.spender,
    identity,
    isCurrent,
    assertCurrent,
  ]);

  // Initial fetch
  useEffect(() => {
    fetchAllowance().catch((e) =>
      console.warn("useERC20Allowance: initial fetch failed:", e),
    );
  }, [fetchAllowance]);

  // Auto-refresh interval
  useEffect(() => {
    if (options.refreshInterval && options.refreshInterval > 0) {
      intervalRef.current = setInterval(
        fetchAllowance,
        options.refreshInterval,
      );
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [options.refreshInterval, fetchAllowance]);

  const allowance = useMemo(() => {
    if (allowanceRaw === null) return null;
    // No `?? 18`. This string is what a user reads when auditing what they
    // have approved: formatting a 6-decimal allowance with 18 turns
    // 1,000,000 USDC into "0.000001", which reads as safe. Return null and let
    // the caller show the raw value and say the precision is unknown.
    const decimals = options.token.decimals;
    if (decimals === undefined) return null;
    return formatUnits(allowanceRaw, decimals);
  }, [allowanceRaw, options.token.decimals]);

  return {
    allowance,
    allowanceRaw,
    isFetching,
    error,
    refetch: fetchAllowance,
  };
}
