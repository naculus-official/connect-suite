/**
 * useTokenList — React hook for loading token lists.
 *
 * Manages TokenListManager lifecycle and provides reactive
 * token data scoped to a specific chain.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { TokenListManager } from "@naculus/connect-core";
import type { TokenListEntry, TokenListSource, TokenListManagerConfig } from "@naculus/connect-core";
import { eip155ChainIdToNumber } from "@naculus/connect-appkit-core";

export interface UseTokenListOptions {
  /** Auto-load on mount (default: true) */
  autoLoad?: boolean;
  /** Custom sources (overrides defaults) */
  sources?: TokenListSource[];
}

export interface UseTokenListReturn {
  /** Loaded tokens for the specified chain */
  tokens: TokenListEntry[];
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Whether tokens have been loaded at least once */
  isLoaded: boolean;
  /** Last error, if any */
  error: Error | null;
  /** Force a full refresh from all sources */
  refetch: () => Promise<void>;
}

/**
 * React hook for accessing token lists for a specific chain.
 *
 * @example
 * const { tokens, isLoading } = useTokenList("eip155:1");
 * // tokens → [WETH, USDC, USDT, DAI, ...]
 */
export function useTokenList(
  chainId?: string,
  options?: UseTokenListOptions,
): UseTokenListReturn {
  const managerRef = useRef<TokenListManager | null>(null);
  const [tokens, setTokens] = useState<TokenListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(options?.autoLoad !== false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize manager once
  if (!managerRef.current) {
    const config: Partial<TokenListManagerConfig> = {};
    if (options?.sources) {
      config.sources = options.sources;
    }
    managerRef.current = new TokenListManager(config);
  }

  const load = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;

    setIsLoading(true);
    setError(null);

    try {
      await manager.load();
      const numericChainId = chainId ? eip155ChainIdToNumber(chainId) : undefined;
      const loaded = manager.getTokens(
        numericChainId !== undefined ? { chainId: numericChainId } : undefined,
      );
      setTokens(loaded);
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  const refetch = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;

    setIsLoading(true);
    setError(null);

    try {
      await manager.refresh();
      const numericChainId = chainId ? eip155ChainIdToNumber(chainId) : undefined;
      const loaded = manager.getTokens(
        numericChainId !== undefined ? { chainId: numericChainId } : undefined,
      );
      setTokens(loaded);
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    if (options?.autoLoad !== false) {
      load();
    }
  }, [load, options?.autoLoad]);

  return { tokens, isLoading, isLoaded, error, refetch };
}

/**
 * Parse a CAIP-2 chain ID like "eip155:1" into a numeric chain ID (1).
 * Returns undefined for non-numeric chains.
 */

