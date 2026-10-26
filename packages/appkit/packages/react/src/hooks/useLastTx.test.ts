// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLastTx } from "./useLastTx";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

class MockMonitor implements TxMonitorLike {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  async watchTx(): Promise<TxStatusEntry> { throw new Error("not implemented"); }
  stopWatching(): void {}
  getTxStatus(): TxStatusEntry | null { return null; }
  async getTxHistory(): Promise<TxStatusEntry[]> { return []; }
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

  emitConfirmed(entry: TxStatusEntry): void {
    const set = this.listeners.get("confirmed");
    if (set) set.forEach(fn => fn(entry));
  }

  emitFailed(entry: TxStatusEntry): void {
    const set = this.listeners.get("failed");
    if (set) set.forEach(fn => fn(entry));
  }
}

describe("useLastTx", () => {
  let monitor: MockMonitor;

  beforeEach(() => {
    monitor = new MockMonitor();
  });

  it("returns null initially", () => {
    const { result } = renderHook(() => useLastTx(monitor));
    expect(result.current.lastTx).toBeNull();
    expect(result.current.lastConfirmedTx).toBeNull();
    expect(result.current.lastFailedTx).toBeNull();
  });

  it("updates lastConfirmedTx on confirmed event", () => {
    const { result } = renderHook(() => useLastTx(monitor));

    const now = Date.now();
    const entry: TxStatusEntry = {
      hash: "0x" + "a".repeat(64), chainId: 1,
      from: "", to: "", value: "0x0",
      status: "confirmed", createdAt: now, updatedAt: now,
      replacementCount: 0, confirmedAt: now,
    };

    act(() => {
      monitor.emitConfirmed(entry);
    });

    expect(result.current.lastTx).not.toBeNull();
    expect(result.current.lastTx!.hash).toBe(entry.hash);
    expect(result.current.lastConfirmedTx).not.toBeNull();
    expect(result.current.lastConfirmedTx!.hash).toBe(entry.hash);
  });

  it("updates lastFailedTx on failed event", () => {
    const { result } = renderHook(() => useLastTx(monitor));

    const now = Date.now();
    const entry: TxStatusEntry = {
      hash: "0x" + "b".repeat(64), chainId: 1,
      from: "", to: "", value: "0x0",
      status: "failed", createdAt: now, updatedAt: now,
      replacementCount: 0, error: "reverted",
    };

    act(() => {
      monitor.emitFailed(entry);
    });

    expect(result.current.lastTx).not.toBeNull();
    expect(result.current.lastTx!.hash).toBe(entry.hash);
    expect(result.current.lastFailedTx).not.toBeNull();
    expect(result.current.lastFailedTx!.hash).toBe(entry.hash);
  });

  it("clears on clear() call", () => {
    const { result } = renderHook(() => useLastTx(monitor));

    const now = Date.now();
    act(() => {
      monitor.emitConfirmed({
        hash: "0x" + "c".repeat(64), chainId: 1,
        from: "", to: "", value: "0x0",
        status: "confirmed", createdAt: now, updatedAt: now,
        replacementCount: 0, confirmedAt: now,
      });
    });

    expect(result.current.lastTx).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    expect(result.current.lastTx).toBeNull();
    expect(result.current.lastConfirmedTx).toBeNull();
  });
});
