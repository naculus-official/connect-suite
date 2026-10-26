import { useState, useEffect, useCallback, useRef } from "react";

// ── Types (standalone, to avoid dependency on wallet-engine) ──────

export type TxStatus =
  | "pending"
  | "mined"
  | "confirmed"
  | "failed"
  | "unknown";

export interface TxStatusEntry {
  hash: string;
  chainId: number;
  from: string;
  to: string;
  value: string;
  data?: string;
  nonce?: number;
  status: TxStatus;
  blockNumber?: number;
  blockHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  createdAt: number;
  confirmedAt?: number;
  updatedAt: number;
  error?: string;
  label?: string;
  memo?: string;
  replacementCount?: number;
}

/** Minimal TxMonitor interface for React hooks */
export interface TxMonitorLike {
  watchTx(hash: string, chainId: number, options?: {
    requiredConfirmations?: number;
    pollInterval?: number;
    label?: string;
    memo?: string;
    initialEntry?: Partial<TxStatusEntry>;
  }): Promise<TxStatusEntry>;

  stopWatching(hash: string, chainId?: number): void;
  getTxStatus(hash: string, chainId?: number): TxStatusEntry | null;
  getTxHistory(address?: string, chainId?: number): Promise<TxStatusEntry[]>;
  refreshTx(hash: string, chainId?: number): Promise<void>;

  on(event: "statusChange", listener: (entry: TxStatusEntry) => void): this;
  on(event: "confirmed", listener: (entry: TxStatusEntry) => void): this;
  on(event: "failed", listener: (entry: TxStatusEntry) => void): this;
  off(event: string, listener: (entry: TxStatusEntry) => void): this;
}

// ── Context for providing TxMonitor ───────────────────────────────

import { createContext, useContext } from "react";

export const TxMonitorContext = createContext<TxMonitorLike | null>(null);

export function useTxMonitorProvider(): TxMonitorLike | null {
  return useContext(TxMonitorContext);
}

// ── Hook ──────────────────────────────────────────────────────────

export interface UseTxMonitorResult {
  entry: TxStatusEntry | null;
  status: TxStatus | "idle";
  isLoading: boolean;
  isWatching: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  stopWatching: () => void;
}

/**
 * Monitor a single transaction's lifecycle.
 * When hash changes, automatically stops old watch and starts new one.
 */
export function useTxMonitor(
  hash?: string,
  chainId?: number,
  monitor?: TxMonitorLike,
): UseTxMonitorResult {
  const ctxMonitor = useTxMonitorProvider();
  const effectiveMonitor = monitor ?? ctxMonitor;

  const [entry, setEntry] = useState<TxStatusEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const prevHashRef = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!effectiveMonitor || !hash) return;
    setIsLoading(true);
    setError(null);
    try {
      await effectiveMonitor.refreshTx(hash, chainId);
      const current = effectiveMonitor.getTxStatus(hash, chainId);
      if (current) setEntry(current);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveMonitor, hash, chainId]);

  const stopWatching = useCallback(() => {
    if (!effectiveMonitor || !hash) return;
    effectiveMonitor.stopWatching(hash, chainId);
    setIsWatching(false);
  }, [effectiveMonitor, hash, chainId]);

  useEffect(() => {
    if (!effectiveMonitor || !hash || !chainId) {
      setEntry(null);
      setIsWatching(false);
      return;
    }

    // Stop previous watch if hash changed
    if (prevHashRef.current && prevHashRef.current !== hash) {
      effectiveMonitor.stopWatching(prevHashRef.current);
    }
    prevHashRef.current = hash;

    let cancelled = false;
    setIsWatching(true);
    setIsLoading(true);
    setError(null);

    // Check if we already have status
    const current = effectiveMonitor.getTxStatus(hash, chainId);
    if (current) {
      setEntry(current);
      setIsLoading(false);
    }

    // Start watching
    effectiveMonitor.watchTx(hash, chainId, {}).then((initial) => {
      if (!cancelled) {
        setEntry(initial);
        setIsLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    });

    // Listen for status changes
    const onStatusChange = (updated: TxStatusEntry) => {
      if (!cancelled) setEntry({ ...updated });
    };
    effectiveMonitor.on("statusChange", onStatusChange);

    return () => {
      cancelled = true;
      setIsWatching(false);
      effectiveMonitor.off("statusChange", onStatusChange);
    };
  }, [effectiveMonitor, hash, chainId]);

  const status: TxStatus | "idle" = entry?.status ?? "idle";

  return {
    entry,
    status,
    isLoading,
    isWatching,
    error,
    refresh,
    stopWatching,
  };
}
