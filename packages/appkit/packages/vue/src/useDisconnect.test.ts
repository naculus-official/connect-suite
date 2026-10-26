import { describe, expect, it, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { useDisconnect } from "./useDisconnect";

describe("useDisconnect", () => {
  it("does nothing while disconnected and calls the supplied action once", async () => {
    let finish!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const status = ref("disconnected");
    const scope = effectScope();
    const result = scope.run(() => useDisconnect(action, status));
    if (!result) throw new Error("No composable result");
    await result.disconnect();
    expect(action).not.toHaveBeenCalled();
    status.value = "connected";
    const first = result.disconnect();
    const second = result.disconnect();
    expect(first).toBe(second);
    expect(result.isDisconnecting.value).toBe(true);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(result.isDisconnecting.value).toBe(false);
    scope.stop();
  });

  it("records failures while active but ignores them after cleanup", async () => {
    let fail!: (reason: unknown) => void;
    const action = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    const scope = effectScope();
    const result = scope.run(() => useDisconnect(action, "connected"));
    if (!result) throw new Error("No composable result");
    const first = result.disconnect();
    await Promise.resolve();
    fail("offline");
    await first;
    expect(result.error.value?.message).toBe("Disconnect failed");
    const late = result.disconnect();
    await Promise.resolve();
    result.cleanup();
    fail(new Error("late"));
    await late;
    expect(result.error.value).toBeNull();
    scope.stop();
  });

  it("uses the action selected at click time even if the action ref changes", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const action = shallowRef(first);
    const scope = effectScope();
    const result = scope.run(() => useDisconnect(action, "connected"));
    if (!result) throw new Error("No composable result");
    const pending = result.disconnect();
    action.value = second;
    await pending;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    scope.stop();
  });
});
