import {
  type SimulationTransaction,
  simulateTransactionPreview,
} from "@naculus/connect-appkit-core";
import type { SimulationResult } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, watch, watchEffect } from "vue";
import { useTransactionSimulation } from "./useTransactionSimulation";

// Pass-through by default; a test can hand one call a deferred promise to
// settle a simulation (with a result or a thrown error) on its own schedule.
vi.mock("@naculus/connect-appkit-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@naculus/connect-appkit-core")>();
  return {
    ...actual,
    simulateTransactionPreview: vi.fn(actual.simulateTransactionPreview),
  };
});

function deferPreview() {
  let resolve!: (value: SimulationResult) => void;
  let reject!: (cause: Error) => void;
  vi.mocked(simulateTransactionPreview).mockImplementationOnce(
    () =>
      new Promise<SimulationResult>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return {
    resolve: (value: SimulationResult) => resolve(value),
    reject: (cause: Error) => reject(cause),
  };
}

/** A distinct result object; tests compare results by identity only. */
function preview(summary: string): SimulationResult {
  return { status: "success", summary } as unknown as SimulationResult;
}

const tx = { to: `0x${"1".repeat(40)}` };

describe("useTransactionSimulation", () => {
  it("rejects an unknown chain and uses explicit client context", async () => {
    const scope = effectScope();
    const chainId = ref<number>();
    const call = vi.fn().mockResolvedValue({});
    const hook = scope.run(() =>
      useTransactionSimulation(tx, {
        chainId,
        publicClient: { chain: { id: 1 }, call },
      }),
    )!;
    await expect(hook.simulate()).rejects.toThrow(/No chain/);
    chainId.value = 1;
    const result = await hook.simulate();
    expect(result.status).toBe("success");
    expect(call).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("debounces input changes and drops a late result after disposal", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      const call = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const transaction = ref(tx);
      const scope = effectScope();
      const hook = scope.run(() =>
        useTransactionSimulation(transaction, {
          chainId: 1,
          publicClient: { chain: { id: 1 }, call },
        }),
      )!;
      transaction.value = { to: `0x${"2".repeat(40)}` };
      await vi.advanceTimersByTimeAsync(300);
      expect(call).toHaveBeenCalledOnce();
      scope.stop();
      finish({});
      await Promise.resolve();
      expect(hook.result.value).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidates an in-flight preview as soon as inputs change", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      const call = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const transaction = ref(tx);
      const scope = effectScope();
      const hook = scope.run(() =>
        useTransactionSimulation(transaction, {
          chainId: 1,
          publicClient: { chain: { id: 1 }, call },
        }),
      )!;
      await vi.advanceTimersByTimeAsync(300);
      expect(call).toHaveBeenCalledOnce();
      transaction.value = { to: `0x${"3".repeat(40)}` };
      await vi.advanceTimersByTimeAsync(0);
      finish({});
      await Promise.resolve();
      expect(hook.result.value).toBeUndefined();
      scope.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the newest simulation when an older one resolves last", async () => {
    const calls: Array<{ resolve: () => void; reject: (e: Error) => void }> =
      [];
    const call = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          calls.push({ resolve, reject });
        }),
    );
    const scope = effectScope();
    const hook = scope.run(() =>
      useTransactionSimulation(tx, {
        chainId: 1,
        publicClient: { chain: { id: 1 }, call },
      }),
    )!;

    const callA = hook.simulate();
    const callB = hook.simulate();
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    calls[1]!.resolve();
    await callB;
    expect(hook.result.value?.status).toBe("success");
    calls[0]!.reject(new Error("execution reverted"));
    await callA;
    expect(hook.result.value?.status).toBe("success");
    expect(hook.isSimulating.value).toBe(false);
    scope.stop();
  });

  it("keeps the visible error when simulating without a transaction", async () => {
    const transaction = ref<typeof tx | undefined>(tx);
    const scope = effectScope();
    const hook = scope.run(() => useTransactionSimulation(transaction))!;
    await expect(hook.simulate()).rejects.toThrow(/No chain/);
    const visible = hook.error.value;
    expect(visible).not.toBeNull();

    transaction.value = undefined;
    await nextTick(); // let the input watcher settle before the call
    const writes: Array<Error | null> = [];
    watch(hook.error, (value) => writes.push(value), { flush: "sync" });
    const result = await hook.simulate();
    expect(result.status).toBe("unavailable");
    expect(hook.result.value).toBe(result);
    expect(hook.error.value).toBe(visible);
    // Not even a transient clear-and-restore.
    expect(writes).toEqual([]);
    expect(hook.isSimulating.value).toBe(false);
    scope.stop();
  });

  it("rejects rather than throws when the transaction getter throws", async () => {
    const scope = effectScope();
    let armed = false;
    const hook = scope.run(() =>
      useTransactionSimulation(() => {
        if (armed) throw new Error("bad input");
        return undefined;
      }),
    )!;
    armed = true;
    const pending = hook.simulate();
    await expect(pending).rejects.toThrow("bad input");
    scope.stop();
  });

  it("does not re-run a consumer effect that calls a failing simulate()", async () => {
    const scope = effectScope();
    let runs = 0;
    let failures = 0;
    scope.run(() => {
      // No chain context: every call rejects.
      const hook = useTransactionSimulation(tx);
      watchEffect(() => {
        runs++;
        // Bounded so a regression fails the assertion instead of hanging.
        if (runs > 20) return;
        hook.simulate().catch(() => {
          failures++;
        });
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(failures).toBe(1);
    expect(runs).toBe(1);
    scope.stop();
  });

  it("clears isSimulating only once the error is visible", async () => {
    const scope = effectScope();
    const seen: string[] = [];
    const hook = scope.run(() => {
      // No chain context: the call rejects.
      const state = useTransactionSimulation(tx);
      const record = (flush: string) => (busy: boolean) => {
        if (!busy) seen.push(`${flush}:${state.error.value?.message ?? null}`);
      };
      watch(state.isSimulating, record("sync"), { flush: "sync" });
      watch(state.isSimulating, record("pre"));
      return state;
    })!;
    const failure = await hook.simulate().catch((cause: Error) => cause);
    await nextTick();
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(seen).toEqual([`sync:${message}`, `pre:${message}`]);
    scope.stop();
  });

  it("drops a late result and error after disposal", async () => {
    const pending: Array<{ resolve: () => void; reject: (e: Error) => void }> =
      [];
    const call = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    );
    const scope = effectScope();
    const hook = scope.run(() =>
      useTransactionSimulation(tx, {
        chainId: 1,
        publicClient: { chain: { id: 1 }, call },
      }),
    )!;
    const callA = hook.simulate();
    await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    scope.stop();
    pending[0]!.resolve();
    await callA;
    expect(hook.result.value).toBeUndefined();
    expect(hook.isSimulating.value).toBe(true);
    expect(hook.error.value).toBeNull();
  });
});

describe("useTransactionSimulation once the transaction is removed", () => {
  it("drops a late result and stops simulating", async () => {
    const transaction = ref<SimulationTransaction | undefined>(tx);
    const scope = effectScope();
    const hook = scope.run(() => useTransactionSimulation(transaction))!;
    const a = deferPreview();
    const callA = hook.simulate();
    expect(hook.isSimulating.value).toBe(true);

    transaction.value = undefined;
    await nextTick();
    expect(hook.isSimulating.value).toBe(false);

    a.resolve(preview("late"));
    await callA;
    expect(hook.result.value).toBeUndefined();
    expect(hook.error.value).toBeNull();
    expect(hook.isSimulating.value).toBe(false);
    scope.stop();
  });

  it("drops a late failure and keeps the last result", async () => {
    const transaction = ref<SimulationTransaction | undefined>(tx);
    const scope = effectScope();
    const hook = scope.run(() => useTransactionSimulation(transaction))!;
    const shown = preview("shown");
    const first = deferPreview();
    const firstCall = hook.simulate();
    first.resolve(shown);
    await firstCall;
    expect(hook.result.value).toBe(shown);

    const a = deferPreview();
    const callA = hook.simulate().catch((cause: Error) => cause);
    expect(hook.isSimulating.value).toBe(true);
    transaction.value = undefined;
    await nextTick();
    expect(hook.isSimulating.value).toBe(false);
    expect(hook.result.value).toBe(shown);

    a.reject(new Error("stale"));
    expect(await callA).toBeInstanceOf(Error);
    expect(hook.result.value).toBe(shown);
    expect(hook.error.value).toBeNull();
    expect(hook.isSimulating.value).toBe(false);
    scope.stop();
  });

  it("keeps B when A settles after B for a changed transaction", async () => {
    const transaction = ref<SimulationTransaction | undefined>(tx);
    const scope = effectScope();
    const hook = scope.run(() => useTransactionSimulation(transaction))!;
    const a = deferPreview();
    const callA = hook.simulate().catch((cause: Error) => cause);
    transaction.value = { to: `0x${"4".repeat(40)}` };
    await nextTick();
    const b = deferPreview();
    const callB = hook.simulate();
    const newest = preview("b");
    b.resolve(newest);
    await callB;
    a.reject(new Error("stale"));
    await callA;
    expect(hook.result.value).toBe(newest);
    expect(hook.error.value).toBeNull();
    expect(hook.isSimulating.value).toBe(false);
    scope.stop();
  });
});
