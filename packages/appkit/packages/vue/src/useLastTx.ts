import { shallowRef, toValue, watch } from "vue";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

export interface UseLastTxReturn {
  lastTx: ShallowRef<TxStatusEntry | null>;
  lastConfirmedTx: ShallowRef<TxStatusEntry | null>;
  lastFailedTx: ShallowRef<TxStatusEntry | null>;
  clear: () => void;
}

/** Track the latest confirmed or failed transaction from a caller-owned monitor. */
export function useLastTx(
  monitor: MaybeRefOrGetter<TxMonitorLike | null | undefined>,
): UseLastTxReturn {
  const lastTx = shallowRef<TxStatusEntry | null>(null);
  const lastConfirmedTx = shallowRef<TxStatusEntry | null>(null);
  const lastFailedTx = shallowRef<TxStatusEntry | null>(null);

  watch(
    () => toValue(monitor),
    (activeMonitor, _previous, onCleanup) => {
      if (!activeMonitor) return;
      const recordLatest = (entry: TxStatusEntry): void => {
        if (!lastTx.value || entry.createdAt >= lastTx.value.createdAt) {
          lastTx.value = entry;
        }
      };
      const onConfirmed = (entry: TxStatusEntry): void => {
        lastConfirmedTx.value = entry;
        recordLatest(entry);
      };
      const onFailed = (entry: TxStatusEntry): void => {
        lastFailedTx.value = entry;
        recordLatest(entry);
      };
      activeMonitor.on("confirmed", onConfirmed);
      activeMonitor.on("failed", onFailed);
      onCleanup(() => {
        activeMonitor.off("confirmed", onConfirmed);
        activeMonitor.off("failed", onFailed);
      });
    },
    { immediate: true },
  );

  return {
    lastTx,
    lastConfirmedTx,
    lastFailedTx,
    clear: () => {
      lastTx.value = null;
      lastConfirmedTx.value = null;
      lastFailedTx.value = null;
    },
  };
}
