import {
  type CompareCosts,
  type CompareCostsInput,
  type CostComparison,
  compareCostsKey,
} from "@naculus/connect-appkit-core";
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { shallowRef, toValue, unref, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseCompareCostsReturn {
  comparisons: ShallowRef<CostComparison[]>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refresh: () => Promise<void>;
}

/**
 * Compare an operation's cost across chains through a caller-supplied
 * function, mirroring the React hook. Re-fetches when the input's *value*
 * changes (appkit-core's `compareCostsKey`), not when a new array or object
 * with the same content is passed; only the newest request may write.
 */
export function useCompareCosts(
  input: MaybeRefOrGetter<CompareCostsInput>,
  compareCosts?: MaybeRef<CompareCosts | null | undefined>,
): UseCompareCostsReturn {
  // loading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const comparisons = shallowRef<CostComparison[]>([]);
  const loading = shallowRef(false);

  const fetchComparisons = async (): Promise<void> => {
    const { operation, chains, options } = toValue(input);
    const fn = unref(compareCosts);
    // Early exits supersede the in-flight request and stop loading, but, as
    // before, leave the visible error alone.
    if (!chains || chains.length === 0) {
      guard.invalidate();
      loading.value = false;
      comparisons.value = [];
      return;
    }
    if (!fn) {
      guard.invalidate();
      loading.value = false;
      return;
    }
    loading.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            const result = await fn(operation, chains, options);
            commit(() => {
              comparisons.value = result;
            });
          } catch (cause) {
            commit(() => {
              comparisons.value = [];
            });
            throw cause;
          }
        },
        "Cost comparison failed",
        (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        {
          onSettled: () => {
            loading.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    [() => compareCostsKey(toValue(input)), () => unref(compareCosts)],
    () => {
      void fetchComparisons();
    },
    { immediate: true },
  );

  return {
    comparisons,
    loading,
    error: guard.error,
    refresh: fetchComparisons,
  };
}
