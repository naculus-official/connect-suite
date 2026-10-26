// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTxHistory } from "./useTxHistory";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

class MockMonitor implements TxMonitorLike {
  private entries: TxStatusEntry[] = [];
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  setEntries(entries: TxStatusEntry[]): void {
    this.entries = entries;
  }

  async watchTx(): Promise<TxStatusEntry> {
    throw new Error("not implemented");
  }
  stopWatching(): void {}
  getTxStatus(): TxStatusEntry | null { return null; }

  async getTxHistory(): Promise<TxStatusEntry[]> {
    return this.entries;
  }
  async refreshTx(): Promise<void> {}

  on(event: string, listener: (...args: any[]) => void): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }
  off(event: string, listener: (...args: any[]) => void): this {
    const set = this.listeners.get(event);
    if (set) set.delete(listener);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) set.forEach(fn => fn(...args));
  }
}

describe("useTxHistory", () => {
  let monitor: MockMonitor;

  beforeEach(() => {
    monitor = new MockMonitor();
  });

  it("returns empty array when no history exists", async () => {
    const { result } = renderHook(() => useTxHistory(undefined, undefined, monitor));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.summary.pending).toBe(0);
    expect(result.current.summary.confirmed).toBe(0);
    expect(result.current.summary.failed).toBe(0);
  });

  it("returns history entries", async () => {
    const entry: TxStatusEntry = {
      hash: "0x" + "a".repeat(64), chainId: 1,
      from: "", to: "", value: "0x0",
      status: "confirmed", createdAt: Date.now(), updatedAt: Date.now(),
      replacementCount: 0,
    };
    monitor.setEntries([entry]);

    const { result } = renderHook(() => useTxHistory(undefined, undefined, monitor));

    await waitFor(() => {
      expect(result.current.entries.length).toBe(1);
    });

    expect(result.current.entries[0].hash).toBe(entry.hash);
    expect(result.current.summary.confirmed).toBe(1);
  });

  it("provides status summary counts", async () => {
    const now = Date.now();
    monitor.setEntries([
      { hash: "0x1" + "a".repeat(63), chainId: 1, from: "", to: "", value: "0x0",
        status: "pending", createdAt: now, updatedAt: now, replacementCount: 0 },
      { hash: "0x2" + "b".repeat(63), chainId: 1, from: "", to: "", value: "0x0",
        status: "confirmed", createdAt: now, updatedAt: now, replacementCount: 0, confirmedAt: now },
      { hash: "0x3" + "c".repeat(63), chainId: 1, from: "", to: "", value: "0x0",
        status: "failed", createdAt: now, updatedAt: now, replacementCount: 0, error: "reverted" },
      { hash: "0x4" + "d".repeat(63), chainId: 1, from: "", to: "", value: "0x0",
        status: "confirmed", createdAt: now, updatedAt: now, replacementCount: 0, confirmedAt: now },
    ]);

    const { result } = renderHook(() => useTxHistory(undefined, undefined, monitor));

    await waitFor(() => {
      expect(result.current.entries.length).toBe(4);
    });

    expect(result.current.summary).toEqual({
      pending: 1,
      confirmed: 2,
      failed: 1,
    });
  });
});
