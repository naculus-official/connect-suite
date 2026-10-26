import { describe, expect, it } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useTxHistory } from "./useTxHistory";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

class Monitor implements TxMonitorLike {
  entries: TxStatusEntry[] = [];
  private listeners = new Set<(entry: TxStatusEntry) => void>();
  async watchTx(): Promise<TxStatusEntry> { throw new Error("unused"); }
  stopWatching(): void {}
  getTxStatus(): TxStatusEntry | null { return null; }
  async getTxHistory(): Promise<TxStatusEntry[]> { return this.entries; }
  async refreshTx(): Promise<void> {}
  on(event: "statusChange" | "confirmed" | "failed", listener: (entry: TxStatusEntry) => void): this {
    if (event === "statusChange") this.listeners.add(listener);
    return this;
  }
  off(event: string, listener: (...args: any[]) => void): this {
    if (event === "statusChange") this.listeners.delete(listener as (entry: TxStatusEntry) => void);
    return this;
  }
  emitStatus(): void {
    this.listeners.forEach((listener) => listener(this.entries[0]!));
  }
}

function entry(status: TxStatusEntry["status"]): TxStatusEntry {
  const now = Date.now();
  return {
    hash: "0x" + status.padEnd(64, "0"),
    chainId: 1,
    from: "", to: "", value: "0x0", status,
    createdAt: now, updatedAt: now, replacementCount: 0,
  };
}

describe("useTxHistory (Vue)", () => {
  it("loads history and refreshes it after a status change", async () => {
    const monitor = new Monitor();
    monitor.entries = [entry("pending"), entry("confirmed")];
    const out = useTxHistory(ref(undefined), ref(1), monitor);
    await nextTick();
    await Promise.resolve();
    expect(out.entries.value).toHaveLength(2);
    expect(out.summary.value).toEqual({ pending: 1, confirmed: 1, failed: 0 });

    monitor.entries = [entry("failed")];
    monitor.emitStatus();
    await Promise.resolve();
    expect(out.summary.value).toEqual({ pending: 0, confirmed: 0, failed: 1 });
  });

  it("keeps the newest history when an older read resolves last", async () => {
    const monitor = new Monitor();
    const reads: Array<(entries: TxStatusEntry[]) => void> = [];
    monitor.getTxHistory = () =>
      new Promise<TxStatusEntry[]>((resolve) => {
        reads.push(resolve);
      });
    const scope = effectScope();
    const history = scope.run(() => useTxHistory(null, 1, monitor))!;

    const callA = history.refresh();
    const callB = history.refresh();
    const newest = [entry("confirmed")];
    reads[2]!(newest);
    await callB;
    reads[1]!([entry("failed")]);
    reads[0]!([entry("pending")]);
    await callA;
    expect(history.entries.value).toBe(newest);
    expect(history.isLoading.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing after disposal", async () => {
    const monitor = new Monitor();
    const reads: Array<(entries: TxStatusEntry[]) => void> = [];
    monitor.getTxHistory = () =>
      new Promise<TxStatusEntry[]>((resolve) => {
        reads.push(resolve);
      });
    const scope = effectScope();
    const history = scope.run(() => useTxHistory(null, 1, monitor))!;
    scope.stop();
    reads[0]!([entry("confirmed")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(history.entries.value).toEqual([]);
    expect(history.isLoading.value).toBe(true);
  });
});
