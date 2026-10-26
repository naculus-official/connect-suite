/**
 * useTokenSearch — React hook for searching tokens.
 *
 * Debounced search over loaded token lists.
 * Returns structured results (exact + fuzzy matches).
 */

import { useState, useEffect, useRef } from "react";
import { TokenListManager } from "@naculus/connect-core";
import type { TokenSearchResult } from "@naculus/connect-core";
import { getDefaultSources } from "./defaults";
import { eip155ChainIdToNumber } from "@naculus/connect-appkit-core";

const DEBOUNCE_MS = 300;

export interface UseTokenSearchReturn {
  /** Structured search results */
  results: TokenSearchResult;
  /** Whether a search is currently running */
  isSearching: boolean;
}

// Shared manager instance across hooks
let sharedManager: TokenListManager | null = null;

function getManager(): TokenListManager {
  if (!sharedManager) {
    sharedManager = new TokenListManager({
      sources: getDefaultSources(),
    });
    // Start loading in background
    sharedManager.load().catch(() => {});
  }
  return sharedManager;
}

/**
 * React hook for searching tokens by symbol, name, or address.
 *
 * Debounced 300ms to avoid excessive re-renders during typing.
 *
 * @example
 * const { results, isSearching } = useTokenSearch("USDC");
 * // results.exact → [USDC on ETH]
 * // results.fuzzy → [USDC.e on AVAX]
 */
export function useTokenSearch(
  query: string,
  chainId?: string,
): UseTokenSearchReturn {
  const [results, setResults] = useState<TokenSearchResult>({
    exact: [],
    fuzzy: [],
    hasMore: false,
  });
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!trimmedQuery) {
      setResults({ exact: [], fuzzy: [], hasMore: false });
      setIsSearching(false);
      return;
    }

    // Debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(() => {
      const manager = getManager();
      const numericChainId = chainId ? eip155ChainIdToNumber(chainId) : undefined;
      const searchResults = manager.search(trimmedQuery, {
        chainId: numericChainId,
        limit: 20,
      });
      setResults(searchResults);
      setIsSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [trimmedQuery, chainId]);

  return { results, isSearching };
}


