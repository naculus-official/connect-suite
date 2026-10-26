import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useSignMessage } from "./useSignMessage";

describe("useSignMessage", () => {
  it("passes the message unchanged to the caller-owned action", async () => {
    const action = vi.fn().mockResolvedValue("0xsigned");
    const scope = effectScope();
    const hook = scope.run(() => useSignMessage(action))!;
    expect(action).not.toHaveBeenCalled();
    await expect(hook.signMessage("hello\u0000world")).resolves.toBe(
      "0xsigned",
    );
    expect(action).toHaveBeenCalledWith("hello\u0000world");
    expect(hook.isSigning.value).toBe(false);
    scope.stop();
  });

  it("keeps loading true until all concurrent signatures settle", async () => {
    const resolvers: Array<(value: string) => void> = [];
    const action = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const scope = effectScope();
    const hook = scope.run(() => useSignMessage(action))!;
    const first = hook.signMessage("first");
    const second = hook.signMessage("second");
    expect(hook.isSigning.value).toBe(true);
    resolvers[0]!("sig-1");
    await first;
    expect(hook.isSigning.value).toBe(true);
    resolvers[1]!("sig-2");
    await second;
    expect(hook.isSigning.value).toBe(false);
    scope.stop();
  });

  it("normalizes non-Error failures and reset clears the error", async () => {
    const scope = effectScope();
    const hook = scope.run(() =>
      useSignMessage(vi.fn().mockRejectedValue("rejected")),
    )!;
    await expect(hook.signMessage("hello")).rejects.toThrow("Signing failed");
    expect(hook.error.value?.message).toBe("Signing failed");
    hook.reset();
    expect(hook.error.value).toBeNull();
    scope.stop();
  });
});
