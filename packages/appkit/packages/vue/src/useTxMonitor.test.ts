import { describe, expect, it } from "vitest";
import { nextTick, ref, shallowRef } from "vue";
import type { MaybeRef } from "vue";
import { inScope } from "../test-utils/scope";
import {
  useTxMonitor,
  type TxMonitorLike,
  type TxStatusEntry,
} from "./useTxMonitor";

function entry(hash: string, status: TxStatusEntry["status"] = "pending"): TxStatusEntry {
  const now = Date.now();
  return {
    hash,
    chainId: 1,
    from: "0x" + "a".repeat(40),
    to: "0x" + "b".repeat(40),
    value: "0x0",
    status,
    createdAt: now,
    updatedAt: now,
    replacementCount: 0,
  };
}

class Monitor implements TxMonitorLike {
  readonly entries = new Map<string, TxStatusEntry>();
  readonly listeners = new Map<string, Set<(entry: TxStatusEntry) => void>>();
  stopped: string | null = null;

  async watchTx(hash: string, chainId: number): Promise<TxStatusEntry> {
    return this.getTxStatus(hash, chainId) ?? entry(hash);
  }
  stopWatching(hash: string, chainId?: number): void {
    this.stopped = `${chainId}:${hash}`;
  }
  getTxStatus(hash: string, chainId?: number): TxStatusEntry | null {
    return this.entries.get(`${chainId}:${hash}`) ?? null;
  }
  async getTxHistory(): Promise<TxStatusEntry[]> {
    return [...this.entries.values()];
  }
  async refreshTx(): Promise<void> {}
  on(event: "statusChange" | "confirmed" | "failed", listener: (next: TxStatusEntry) => void): this {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }
  off(event: string, listener: (...args: any[]) => void): this {
    this.listeners.get(event)?.delete(listener as (next: TxStatusEntry) => void);
    return this;
  }
  emit(event: "statusChange" | "confirmed" | "failed", next: TxStatusEntry): void {
    this.listeners.get(event)?.forEach((listener) => listener(next));
  }
}

describe("useTxMonitor (Vue)", () => {
  it("watches the reactive hash and updates only for that transaction", async () => {
    const monitor = new Monitor();
    const hash = ref("0x" + "1".repeat(64));
    const initial = entry(hash.value);
    monitor.entries.set(`1:${hash.value}`, initial);
    const { api: out, scope } = inScope(() => useTxMonitor(hash, 1, monitor));

    await nextTick();
    await Promise.resolve();
    expect(out.entry.value).toEqual(initial);
    expect(out.status.value).toBe("pending");
    expect(out.isWatching.value).toBe(true);

    monitor.emit("statusChange", entry("0x" + "2".repeat(64), "confirmed"));
    expect(out.status.value).toBe("pending");

    const confirmed = { ...initial, status: "confirmed" as const };
    monitor.emit("statusChange", confirmed);
    expect(out.entry.value).toEqual(confirmed);

    out.stopWatching();
    expect(monitor.stopped).toBe(`1:${hash.value}`);
    expect(out.isWatching.value).toBe(false);
    scope.stop();
  });

  it("clears an old result when the reactive hash becomes unavailable", async () => {
    const monitor = new Monitor();
    const hash = ref<string | null>("0x" + "3".repeat(64));
    const activeHash = hash.value!;
    monitor.entries.set(`1:${activeHash}`, entry(activeHash));
    const { api: out, scope } = inScope(() => useTxMonitor(hash, 1, monitor));
    await nextTick();
    await Promise.resolve();
    expect(out.entry.value).not.toBeNull();

    hash.value = null;
    await nextTick();
    expect(out.entry.value).toBeNull();
    expect(out.status.value).toBe("idle");
    scope.stop();
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A monitor whose refreshTx and (optionally) watchTx settle on demand. */
class ControlledMonitor extends Monitor {
  readonly refreshes: Array<Deferred<void>> = [];
  readonly watches: Array<Deferred<TxStatusEntry>> = [];
  holdWatch = false;

  override watchTx(hash: string, chainId: number): Promise<TxStatusEntry> {
    if (!this.holdWatch) return super.watchTx(hash, chainId);
    const pending = deferred<TxStatusEntry>();
    this.watches.push(pending);
    return pending.promise;
  }
  override refreshTx(): Promise<void> {
    const pending = deferred<void>();
    this.refreshes.push(pending);
    return pending.promise;
  }
}

const HASH_A = "0x" + "a".repeat(64);
const HASH_B = "0x" + "b".repeat(64);

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

async function mounted(
  monitor: ControlledMonitor,
  hash: MaybeRef<string | null>,
  chainId: MaybeRef<number | null> = 1,
) {
  const { api, scope } = inScope(() => useTxMonitor(hash, chainId, monitor));
  await settle();
  return { out: api, scope };
}

describe("useTxMonitor (Vue) refresh supersession", () => {
  it("ignores an older refresh that succeeds after a newer one", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);

    const older = out.refresh();
    const newer = out.refresh();
    const confirmed = entry(HASH_A, "confirmed");
    monitor.entries.set(`1:${HASH_A}`, confirmed);
    monitor.refreshes[1].resolve(undefined);
    await newer;
    expect(out.entry.value).toBe(confirmed);

    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A, "mined"));
    monitor.refreshes[0].resolve(undefined);
    await older;
    expect(out.entry.value).toBe(confirmed);
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });

  it("drops an older refresh failure that lands after a newer success", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);

    const older = out.refresh();
    const newer = out.refresh();
    monitor.refreshes[1].resolve(undefined);
    await newer;
    monitor.refreshes[0].reject(new Error("stale"));
    await older;
    expect(out.error.value).toBeNull();
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });

  it("keeps loading until the newest overlapping refresh settles", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);

    const older = out.refresh();
    const newer = out.refresh();
    expect(out.isLoading.value).toBe(true);
    monitor.refreshes[0].resolve(undefined);
    await older;
    expect(out.isLoading.value).toBe(true);
    monitor.refreshes[1].resolve(undefined);
    await newer;
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });

  it("clears the entry when the refreshed transaction is no longer known", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);
    expect(out.entry.value).not.toBeNull();

    const call = out.refresh();
    monitor.entries.delete(`1:${HASH_A}`);
    monitor.refreshes[0].resolve(undefined);
    await call;
    expect(out.entry.value).toBeNull();
    expect(out.status.value).toBe("idle");
    scope.stop();
  });

  it("drops the previous hash's entry as soon as the hash changes", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const hash = ref(HASH_A);
    const { out, scope } = await mounted(monitor, hash);
    expect(out.entry.value?.hash).toBe(HASH_A);

    monitor.holdWatch = true;
    hash.value = HASH_B;
    await settle();
    expect(out.entry.value).toBeNull();
    expect(out.isLoading.value).toBe(true);
    scope.stop();
  });

  it("does not let a refresh for the previous hash write into the new one", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const hash = ref(HASH_A);
    const { out, scope } = await mounted(monitor, hash);

    const success = out.refresh();
    const failure = out.refresh();
    monitor.holdWatch = true;
    hash.value = HASH_B;
    await settle();
    monitor.refreshes[0].resolve(undefined);
    monitor.refreshes[1].reject(new Error("old hash"));
    await Promise.all([success, failure]);
    expect(out.entry.value).toBeNull();
    expect(out.error.value).toBeNull();
    expect(out.isLoading.value).toBe(true);

    const current = entry(HASH_B, "confirmed");
    monitor.watches[0].resolve(current);
    await settle();
    expect(out.entry.value).toBe(current);
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });

  it("keeps a refresh started for the new hash before the watcher runs", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const hash = ref(HASH_A);
    const { out, scope } = await mounted(monitor, hash);

    monitor.holdWatch = true;
    hash.value = HASH_B;
    const call = out.refresh();
    await settle();
    expect(monitor.refreshes).toHaveLength(1);
    monitor.refreshes[0].reject(new Error("B failed"));
    await call;
    expect(out.error.value?.message).toBe("B failed");
    scope.stop();
  });

  it.each([
    ["succeeds", true],
    ["fails", false],
  ] as const)(
    "ignores a refresh for a hash that was left again within the same tick when it %s",
    async (_label, succeeds) => {
      const monitor = new ControlledMonitor();
      const original = entry(HASH_A);
      monitor.entries.set(`1:${HASH_A}`, original);
      monitor.entries.set(`1:${HASH_B}`, entry(HASH_B, "confirmed"));
      const hash = ref(HASH_A);
      const { out, scope } = await mounted(monitor, hash);

      hash.value = HASH_B;
      const call = out.refresh();
      hash.value = HASH_A;
      await settle();
      if (succeeds) monitor.refreshes[0].resolve(undefined);
      else monitor.refreshes[0].reject(new Error("B failed"));
      await call;
      expect(out.entry.value).toBe(original);
      expect(out.error.value).toBeNull();
      expect(out.isLoading.value).toBe(false);
      scope.stop();
    },
  );

  it("ignores a pending refresh once the monitor is replaced", async () => {
    const first = new ControlledMonitor();
    first.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const second = new ControlledMonitor();
    const replacement = entry(HASH_A, "confirmed");
    second.entries.set(`1:${HASH_A}`, replacement);
    const monitor = shallowRef<ControlledMonitor>(first);
    const { api: out, scope } = inScope(() => useTxMonitor(HASH_A, 1, monitor));
    await settle();

    const call = out.refresh();
    monitor.value = second;
    await settle();
    expect(out.entry.value).toBe(replacement);
    first.refreshes[0].reject(new Error("old monitor"));
    await call;
    expect(out.entry.value).toBe(replacement);
    expect(out.error.value).toBeNull();
    scope.stop();
  });

  it("clears an old entry even when the refresh lands before the watcher runs", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const hash = ref(HASH_A);
    const { out, scope } = await mounted(monitor, hash);

    monitor.holdWatch = true;
    const call = out.refresh();
    monitor.refreshes[0].resolve(undefined);
    hash.value = HASH_B;
    await call;
    await settle();
    expect(out.entry.value).toBeNull();
    scope.stop();
  });

  it.each([
    ["the hash disappears", "hash"],
    ["the chain disappears (idle)", "chain"],
  ] as const)("ignores a pending refresh once %s", async (_label, input) => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const hash = ref<string | null>(HASH_A);
    const chainId = ref<number | null>(1);
    const { out, scope } = await mounted(monitor, hash, chainId);

    const success = out.refresh();
    const failure = out.refresh();
    if (input === "hash") hash.value = null;
    else chainId.value = null;
    await settle();
    expect(out.status.value).toBe("idle");

    monitor.refreshes[0].resolve(undefined);
    monitor.refreshes[1].reject(new Error("late"));
    await Promise.all([success, failure]);
    expect(out.entry.value).toBeNull();
    expect(out.error.value).toBeNull();
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing from a refresh that settles after the scope is disposed", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);
    const before = out.entry.value;

    const success = out.refresh();
    const failure = out.refresh();
    scope.stop();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A, "confirmed"));
    monitor.refreshes[0].resolve(undefined);
    monitor.refreshes[1].reject(new Error("late"));
    await Promise.all([success, failure]);
    expect(out.entry.value).toBe(before);
    expect(out.error.value).toBeNull();
    expect(out.isLoading.value).toBe(true);
  });

  it("still resolves refresh() and publishes the newest failure", async () => {
    const monitor = new ControlledMonitor();
    monitor.entries.set(`1:${HASH_A}`, entry(HASH_A));
    const { out, scope } = await mounted(monitor, HASH_A);

    const call = out.refresh();
    monitor.refreshes[0].reject("not an error");
    await expect(call).resolves.toBeUndefined();
    expect(out.error.value?.message).toBe("Failed to refresh transaction");
    expect(out.isLoading.value).toBe(false);
    scope.stop();
  });
});
