import { describe, expect, it, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { useConnect } from "./useConnect";

describe("useConnect", () => {
  it("tracks provider status and a caller-owned connection action", async () => {
    let finish!: () => void;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const status = ref("disconnected");
    const scope = effectScope();
    const result = scope.run(() => useConnect(action, status));
    if (!result) throw new Error("No composable result");
    expect(action).not.toHaveBeenCalled();
    status.value = "connecting";
    expect(result.isConnecting.value).toBe(true);
    status.value = "disconnected";

    const first = result.connect();
    const second = result.connect();
    expect(first).toBe(second);
    expect(result.isConnecting.value).toBe(true);
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(result.isConnecting.value).toBe(false);
    expect(result.error.value).toBeNull();
    scope.stop();
  });

  it("reports a failed connection without throwing or writing after dispose", async () => {
    let fail!: (reason: unknown) => void;
    const action = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    const scope = effectScope();
    const result = scope.run(() => useConnect(action, "disconnected"));
    if (!result) throw new Error("No composable result");
    const pending = result.connect();
    await Promise.resolve();
    fail("offline");
    await pending;
    expect(result.error.value?.message).toBe("Connection failed");

    const late = result.connect();
    await Promise.resolve();
    scope.stop();
    fail(new Error("late"));
    await late;
    expect(result.error.value).toBeNull();
  });

  it("uses the action selected at click time even if the action ref changes", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const action = shallowRef(first);
    const scope = effectScope();
    const result = scope.run(() => useConnect(action, "disconnected"));
    if (!result) throw new Error("No composable result");
    const pending = result.connect();
    action.value = second;
    await pending;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    scope.stop();
  });
});
