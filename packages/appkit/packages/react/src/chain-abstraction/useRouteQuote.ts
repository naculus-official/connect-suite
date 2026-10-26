/**
 * useRouteQuote — debounced cross-chain route quotes.
 *
 * Types and the "is this amount quotable" decision live in
 * `@naculus/connect-appkit-core` (`routing`), shared with the Vue composable.
 */

import {
  type GetRouteQuotes,
  isQuotableInput,
  type RouteQuote,
  type RouteQuoteInput,
  type RouteQuoteOptions,
} from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type Quote = RouteQuote;
export type QuoteOptions = RouteQuoteOptions;
export type UseRouteQuoteInput = RouteQuoteInput;

export interface UseRouteQuoteReturn {
  quotes: Quote[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

export function useRouteQuote(
  input: UseRouteQuoteInput,
  getQuoteFn?: GetRouteQuotes,
): UseRouteQuoteReturn {
  const { fromChain, toChain, fromToken, toToken, amount, options } = input;
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchQuotes = useCallback(async () => {
    if (!isQuotableInput({ fromChain, toChain, fromToken, amount })) {
      setQuotes([]);
      return;
    }
    if (!getQuoteFn) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getQuoteFn(
        fromChain,
        toChain,
        fromToken,
        amount,
        options,
        toToken,
      );
      if (mountedRef.current) setQuotes(result);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setQuotes([]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fromChain, toChain, fromToken, toToken, amount, options, getQuoteFn]);

  // Debounced auto-fetch on input change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!fromChain || !toChain || !fromToken || !amount) {
      setQuotes([]);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      fetchQuotes();
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [fetchQuotes, fromChain, toChain, fromToken, amount]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    await fetchQuotes();
  }, [fetchQuotes]);

  const clear = useCallback(() => {
    setQuotes([]);
    setError(null);
    setLoading(false);
  }, []);

  return { quotes, loading, error, refresh, clear };
}
