// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTxMonitor, TxMonitorContext } from "./useTxMonitor";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";
import React from "react";

class MockMonitor implements TxMonitorLike {
  private entries = new Map<string, TxStatusEntry>();
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  setEntry(hash: string, chainId: number, entry: TxStatusEntry): void {
    const key = `${chainId}:${hash}`;
    this.entries.set(key, entry);
  }

  async watchTx(hash: string, chainId: number): Promise<TxStatusEntry> {
    const key = `${chainId}:${hash}`;
    const entry = this.entries.get(key) ?? {
      hash,
      chainId,
      from: "",
      to: "",
      value: "0x0",
      status: "unknown" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      replacementCount: 0,
    };
    this.entries.set(key, entry);
    this.emit("statusChange", entry);
    return entry;
  }

  stopWatching(hash: string, chainId?: number): void {
    // no-op
  }

  getTxStatus(hash: string, chainId?: number): TxStatusEntry | null {
    if (chainId !== undefined) return this.entries.get(`${chainId}:${hash}`) ?? null;
    for (const [, entry] of this.entries) {
      if (entry.hash === hash) return entry;
    }
    return null;
  }

  async getTxHistory(): Promise<TxStatusEntry[]> {
    return Array.from(this.entries.values());
  }

  async refreshTx(): Promise<void> {
    // no-op
  }

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

  private emit(event: string, ...args: any[]): void {
    const set = this.listeners.get(event);
    if (set) set.forEach(fn => fn(...args));
  }
}

function Wrapper({ monitor, children }: { monitor: TxMonitorLike; children: React.ReactNode }) {
  return React.createElement(TxMonitorContext.Provider, { value: monitor }, children);
}

describe("useTxMonitor", () => {
  let monitor: MockMonitor;

  beforeEach(() => {
    monitor = new MockMonitor();
  });

  it("returns idle state when no hash provided", () => {
    const { result } = renderHook(() => useTxMonitor(undefined, undefined, monitor));
    expect(result.current.status).toBe("idle");
    expect(result.current.entry).toBeNull();
    expect(result.current.isWatching).toBe(false);
  });

  it("starts watching when hash is provided", async () => {
    const hash = "0x" + "a".repeat(64);
    const entry: TxStatusEntry = {
      hash, chainId: 1, from: "0x" + "b".repeat(40), to: "0x" + "c".repeat(40),
      value: "0x0", status: "pending", createdAt: Date.now(), updatedAt: Date.now(),
      replacementCount: 0,
    };
    monitor.setEntry(hash, 1, entry);

    const { result } = renderHook(() => useTxMonitor(hash, 1, monitor));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entry).not.toBeNull();
    expect(result.current.entry!.hash).toBe(hash);
  });

  it("provides refresh and stopWatching methods", () => {
    const hash = "0x" + "d".repeat(64);
    const { result } = renderHook(() => useTxMonitor(hash, 1, monitor));

    expect(typeof result.current.refresh).toBe("function");
    expect(typeof result.current.stopWatching).toBe("function");
  });

  it("works with TxMonitorContext", () => {
    const hash = "0x" + "e".repeat(64);
    const { result } = renderHook(() => useTxMonitor(hash, 1), {
      wrapper: ({ children }) => React.createElement(Wrapper, { monitor, children }, children),
    });

    expect(result.current.isWatching).toBe(true);
  });
});
