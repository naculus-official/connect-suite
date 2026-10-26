import { useState, useEffect, useCallback, useRef } from "react";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";
import { useTxMonitorProvider } from "./useTxMonitor";

// ── Hook ──────────────────────────────────────────────────────────

export interface UseTxHistoryResult {
  entries: TxStatusEntry[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  summary: {
    pending: number;
    confirmed: number;
    failed: number;
  };
}

/**
 * Query transaction history.
 * address defaults to current wallet address; chainId defaults to current chain.
 */
export function useTxHistory(
  address?: string,
  chainId?: number,
  monitor?: TxMonitorLike,
): UseTxHistoryResult {
  const ctxMonitor = useTxMonitorProvider();
  const effectiveMonitor = monitor ?? ctxMonitor;

  const [entries, setEntries] = useState<TxStatusEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const refreshCounter = useRef(0);

  const refresh = useCallback(async () => {
    if (!effectiveMonitor) return;
    setIsLoading(true);
    setError(null);
    refreshCounter.current++;
    try {
      const results = await effectiveMonitor.getTxHistory(address, chainId);
      setEntries(results);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveMonitor, address, chainId]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  // Listen for status changes to update entries reactively
  useEffect(() => {
    if (!effectiveMonitor) return;

    const onStatusChange = () => {
      // Re-fetch on any status change
      refresh().catch(() => {});
    };
    effectiveMonitor.on("statusChange", onStatusChange);

    return () => {
      effectiveMonitor.off("statusChange", onStatusChange as any);
    };
  }, [effectiveMonitor, refresh]);

  const summary = {
    pending: entries.filter(e => e.status === "pending").length,
    confirmed: entries.filter(e => e.status === "confirmed").length,
    failed: entries.filter(e => e.status === "failed").length,
  };

  return {
    entries,
    isLoading,
    error,
    refresh,
    summary,
  };
}
