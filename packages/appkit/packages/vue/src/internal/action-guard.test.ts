import { describe, expect, it } from "vitest";
import { effectScope, watch } from "vue";
import { useActionGuard } from "./action-guard";

describe("useActionGuard invalidate()", () => {
  it("stops an in-flight call from publishing but keeps the visible error", async () => {
    const scope = effectScope();
    const guard = scope.run(() => useActionGuard())!;
    await guard
      .run(() => Promise.reject(new Error("earlier")), "fallback")
      .catch(() => {});
    expect(guard.error.value?.message).toBe("earlier");

    let release!: () => void;
    let written = false;
    const pending = guard
      .run(async (commit) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        commit(() => {
          written = true;
        });
        throw new Error("late");
      }, "fallback")
      .catch(() => {});
    guard.error.value = new Error("visible");
    guard.invalidate();
    release();
    await pending;
    expect(written).toBe(false);
    expect(guard.error.value?.message).toBe("visible");
    scope.stop();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function scopedGuard() {
  const scope = effectScope();
  const guard = scope.run(() => useActionGuard())!;
  return { guard, scope };
}

describe("useActionGuard keepError", () => {
  it("leaves the visible error untouched when the call starts", async () => {
    const { guard, scope } = scopedGuard();
    const visible = new Error("visible");
    guard.error.value = visible;
    const writes: Array<Error | null> = [];
    watch(guard.error, (value) => writes.push(value), { flush: "sync" });

    const value = await guard.run(async () => "ok", "fallback", undefined, {
      keepError: true,
    });
    expect(value).toBe("ok");
    expect(guard.error.value).toBe(visible);
    expect(writes).toEqual([]);
    scope.stop();
  });

  it("still publishes its own failure", async () => {
    const { guard, scope } = scopedGuard();
    guard.error.value = new Error("visible");
    await guard
      .run(() => Promise.reject(new Error("own")), "fallback", undefined, {
        keepError: true,
      })
      .catch(() => {});
    expect(guard.error.value?.message).toBe("own");
    scope.stop();
  });
});

describe("useActionGuard onSettled", () => {
  it("runs after the error is published, in the same tick", async () => {
    const { guard, scope } = scopedGuard();
    const seen: Array<string | null> = [];
    await guard
      .run(() => Promise.reject(new Error("boom")), "fallback", undefined, {
        onSettled: () => seen.push(guard.error.value?.message ?? null),
      })
      .catch(() => {});
    expect(seen).toEqual(["boom"]);
    scope.stop();
  });

  it("runs after the result is committed", async () => {
    const { guard, scope } = scopedGuard();
    let result: string | null = null;
    const seen: Array<string | null> = [];
    await guard.run(
      async (commit) => {
        commit(() => {
          result = "done";
        });
      },
      "fallback",
      undefined,
      { onSettled: () => seen.push(result) },
    );
    expect(seen).toEqual(["done"]);
    scope.stop();
  });

  it("lets a stale call publish neither result, error nor settlement", async () => {
    const { guard, scope } = scopedGuard();
    const older = deferred<string>();
    const newer = deferred<string>();
    const settled: string[] = [];
    let result: string | null = null;
    const start = (name: string, read: Promise<string>) =>
      guard
        .run(
          async (commit) => {
            const value = await read;
            commit(() => {
              result = value;
            });
          },
          "fallback",
          undefined,
          { onSettled: () => settled.push(name) },
        )
        .catch(() => {});

    const callA = start("A", older.promise);
    const callB = start("B", newer.promise);
    older.reject(new Error("stale"));
    await callA;
    // A settling must not look like B finishing.
    expect(settled).toEqual([]);
    expect(guard.error.value).toBeNull();
    newer.resolve("B");
    await callB;
    expect(result).toBe("B");
    expect(settled).toEqual(["B"]);
    expect(guard.error.value).toBeNull();
    scope.stop();
  });

  it("publishes nothing once the scope is disposed", async () => {
    const { guard, scope } = scopedGuard();
    const success = deferred<string>();
    const failure = deferred<string>();
    const settled: string[] = [];
    let result: string | null = null;
    const start = (name: string, read: Promise<string>) =>
      guard
        .run(
          async (commit) => {
            const value = await read;
            commit(() => {
              result = value;
            });
          },
          "fallback",
          undefined,
          { onSettled: () => settled.push(name) },
        )
        .catch(() => {});

    const callA = start("A", success.promise);
    scope.stop();
    success.resolve("late");
    await callA;
    const callB = start("B", failure.promise);
    failure.reject(new Error("late"));
    await callB;
    expect(result).toBeNull();
    expect(guard.error.value).toBeNull();
    expect(settled).toEqual([]);
  });
});

describe("useActionGuard onSettled throwing", () => {
  it("rejects with the settle error after a success, without leaving busy stuck", async () => {
    const { guard, scope } = scopedGuard();
    const settleError = new Error("settle");
    const outcome = guard.run(async () => "value", "fallback", undefined, {
      onSettled: () => {
        throw settleError;
      },
    });
    // The settle error replaces the resolved value.
    await expect(outcome).rejects.toBe(settleError);
    expect(guard.busy.value).toBe(false);
    expect(guard.error.value).toBeNull();

    await expect(guard.run(async () => "next", "fallback")).resolves.toBe(
      "next",
    );
    expect(guard.busy.value).toBe(false);
    scope.stop();
  });

  it("rejects with the settle error after a failure, keeping the published action error", async () => {
    const { guard, scope } = scopedGuard();
    const actionError = new Error("action");
    const settleError = new Error("settle");
    const outcome = guard.run(
      () => Promise.reject(actionError),
      "fallback",
      undefined,
      {
        onSettled: () => {
          throw settleError;
        },
      },
    );
    // The settle error replaces the rethrown action error; the action error
    // was already published before onSettled ran.
    await expect(outcome).rejects.toBe(settleError);
    expect(guard.error.value).toBe(actionError);
    expect(guard.busy.value).toBe(false);

    await expect(guard.run(async () => "next", "fallback")).resolves.toBe(
      "next",
    );
    expect(guard.busy.value).toBe(false);
    expect(guard.error.value).toBeNull();
    scope.stop();
  });
});
