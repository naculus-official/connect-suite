import { computed, shallowRef, toValue, watch } from "vue";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { useActionGuard } from "./internal/action-guard";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

export interface UseTxHistoryReturn {
  entries: ShallowRef<TxStatusEntry[]>;
  isLoading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refresh: () => Promise<void>;
  summary: ComputedRef<{ pending: number; confirmed: number; failed: number }>;
}

/** Query and keep a caller-owned monitor's transaction history current. */
export function useTxHistory(
  address: MaybeRefOrGetter<string | null | undefined>,
  chainId: MaybeRefOrGetter<number | null | undefined>,
  monitor: MaybeRefOrGetter<TxMonitorLike | null | undefined>,
): UseTxHistoryReturn {
  // isLoading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const entries = shallowRef<TxStatusEntry[]>([]);
  const isLoading = shallowRef(false);

  const refresh = async (): Promise<void> => {
    const activeMonitor = toValue(monitor);
    if (!activeMonitor) {
      guard.reset();
      entries.value = [];
      isLoading.value = false;
      return;
    }
    isLoading.value = true;
    await guard
      .run(
        async (commit) => {
          const result = await activeMonitor.getTxHistory(
            toValue(address) ?? undefined,
            toValue(chainId) ?? undefined,
          );
          commit(() => {
            entries.value = result;
          });
        },
        "Failed to load transaction history",
        undefined,
        {
          onSettled: () => {
            isLoading.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    [() => toValue(monitor), () => toValue(address), () => toValue(chainId)],
    ([activeMonitor], _previous, onCleanup) => {
      if (!activeMonitor) {
        void refresh();
        return;
      }
      const onStatusChange = (): void => {
        void refresh();
      };
      activeMonitor.on("statusChange", onStatusChange);
      onCleanup(() => activeMonitor.off("statusChange", onStatusChange));
      void refresh();
    },
    { immediate: true },
  );

  return {
    entries,
    isLoading,
    error: guard.error,
    refresh,
    summary: computed(() => ({
      pending: entries.value.filter((item) => item.status === "pending").length,
      confirmed: entries.value.filter((item) => item.status === "confirmed")
        .length,
      failed: entries.value.filter((item) => item.status === "failed").length,
    })),
  };
}
