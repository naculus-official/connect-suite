import { useState, useCallback, useRef } from "react";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";
import { useTxMonitorProvider } from "./useTxMonitor";

// ── Hook ──────────────────────────────────────────────────────────

export interface UseLastTxResult {
  /** Most recent transaction by createdAt */
  lastTx: TxStatusEntry | null;
  /** Most recent confirmed transaction */
  lastConfirmedTx: TxStatusEntry | null;
  /** Most recent failed transaction */
  lastFailedTx: TxStatusEntry | null;
  /** Clear cached lastTx state */
  clear: () => void;
}

/**
 * Track the most recent transaction.
 * Automatically updates when a new transaction is sent (via statusChange events).
 */
export function useLastTx(monitor?: TxMonitorLike): UseLastTxResult {
  const ctxMonitor = useTxMonitorProvider();
  const effectiveMonitor = monitor ?? ctxMonitor;

  const [lastTx, setLastTx] = useState<TxStatusEntry | null>(null);
  const [lastConfirmedTx, setLastConfirmedTx] = useState<TxStatusEntry | null>(null);
  const [lastFailedTx, setLastFailedTx] = useState<TxStatusEntry | null>(null);
  const lastTxRef = useRef<{ createdAt: number } | null>(null);

  // Track confirmed and failed events
  const confirmedHandlerRef = useRef<((entry: TxStatusEntry) => void) | null>(null);
  const failedHandlerRef = useRef<((entry: TxStatusEntry) => void) | null>(null);

  // Set up listeners
  if (effectiveMonitor) {
    if (!confirmedHandlerRef.current) {
      confirmedHandlerRef.current = (entry: TxStatusEntry) => {
        setLastConfirmedTx(entry);
        if (!lastTxRef.current || entry.createdAt >= lastTxRef.current.createdAt) {
          setLastTx(entry);
          lastTxRef.current = entry;
        }
      };
      effectiveMonitor.on("confirmed", confirmedHandlerRef.current);
    }

    if (!failedHandlerRef.current) {
      failedHandlerRef.current = (entry: TxStatusEntry) => {
        setLastFailedTx(entry);
        if (!lastTxRef.current || entry.createdAt >= lastTxRef.current.createdAt) {
          setLastTx(entry);
          lastTxRef.current = entry;
        }
      };
      effectiveMonitor.on("failed", failedHandlerRef.current);
    }
  }

  const clear = useCallback(() => {
    setLastTx(null);
    setLastConfirmedTx(null);
    setLastFailedTx(null);
    lastTxRef.current = null;
  }, []);

  return {
    lastTx,
    lastConfirmedTx,
    lastFailedTx,
    clear,
  };
}
