/**
 * useCompareCosts — compare an operation's cost across chains.
 *
 * Types and the value-key for the input live in
 * `@naculus/connect-appkit-core` (`routing`), shared with the Vue composable.
 */

import {
  type CompareCosts,
  type CompareCostsInput,
  type CostComparison,
  type CostComparisonOperation,
  type CostComparisonOptions,
  compareCostsKey,
} from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type { CostComparison, CostComparisonOperation, CostComparisonOptions };
export type UseCompareCostsInput = CompareCostsInput;

export interface UseCompareCostsReturn {
  comparisons: CostComparison[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCompareCosts(
  input: UseCompareCostsInput,
  compareCostsFn?: CompareCosts,
): UseCompareCostsReturn {
  const { operation, chains, options } = input;
  const [comparisons, setComparisons] = useState<CostComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  // Keyed on the values, not the array/object identity — see compareCostsKey.
  const inputKey = compareCostsKey(input);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on inputKey (the inputs by value), not on the array/object identities that change every render; see compareCostsKey
  const fetchComparisons = useCallback(async () => {
    if (!chains || chains.length === 0) {
      setComparisons([]);
      return;
    }
    if (!compareCostsFn) return;

    // Only the newest request may write. A comparison for a previous chain set
    // resolving last would otherwise decide which route the user is shown as
    // cheapest, using costs for chains they are no longer looking at.
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await compareCostsFn(operation, chains, options);
      if (mountedRef.current && generation === generationRef.current) {
        setComparisons(result);
      }
    } catch (err) {
      if (mountedRef.current && generation === generationRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setComparisons([]);
      }
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        setLoading(false);
      }
    }
  }, [inputKey, compareCostsFn]);

  useEffect(() => {
    fetchComparisons();
  }, [fetchComparisons]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    await fetchComparisons();
  }, [fetchComparisons]);

  return { comparisons, loading, error, refresh };
}
