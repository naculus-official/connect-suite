import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useLastTx } from "./useLastTx";
import type { TxMonitorLike, TxStatusEntry } from "./useTxMonitor";

class Monitor implements TxMonitorLike {
  private confirmed = new Set<(entry: TxStatusEntry) => void>();
  private failed = new Set<(entry: TxStatusEntry) => void>();
  async watchTx(): Promise<TxStatusEntry> { throw new Error("unused"); }
  stopWatching(): void {}
  getTxStatus(): TxStatusEntry | null { return null; }
  async getTxHistory(): Promise<TxStatusEntry[]> { return []; }
  async refreshTx(): Promise<void> {}
  on(event: "statusChange" | "confirmed" | "failed", listener: (entry: TxStatusEntry) => void): this {
    if (event === "confirmed") this.confirmed.add(listener);
    if (event === "failed") this.failed.add(listener);
    return this;
  }
  off(event: string, listener: (...args: any[]) => void): this {
    this.confirmed.delete(listener as (entry: TxStatusEntry) => void);
    this.failed.delete(listener as (entry: TxStatusEntry) => void);
    return this;
  }
  emit(event: "confirmed" | "failed", next: TxStatusEntry): void {
    (event === "confirmed" ? this.confirmed : this.failed).forEach((listener) => listener(next));
  }
}

function entry(status: "confirmed" | "failed", createdAt: number): TxStatusEntry {
  return {
    hash: "0x" + status.padEnd(64, "0"), chainId: 1, from: "", to: "", value: "0x0",
    status, createdAt, updatedAt: createdAt, replacementCount: 0,
  };
}

describe("useLastTx (Vue)", () => {
  it("tracks the latest terminal event and clears it on request", () => {
    const monitor = new Monitor();
    const out = useLastTx(ref(monitor));
    const confirmed = entry("confirmed", 1);
    const failed = entry("failed", 2);
    monitor.emit("confirmed", confirmed);
    monitor.emit("failed", failed);

    expect(out.lastConfirmedTx.value).toBe(confirmed);
    expect(out.lastFailedTx.value).toBe(failed);
    expect(out.lastTx.value).toBe(failed);
    out.clear();
    expect(out.lastTx.value).toBeNull();
    expect(out.lastConfirmedTx.value).toBeNull();
    expect(out.lastFailedTx.value).toBeNull();
  });
});
