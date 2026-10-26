import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useSendTransaction } from "./useSendTransaction";

const hash = `0x${"ab".repeat(32)}`;

describe("useSendTransaction", () => {
  it("passes the exact transaction object to the caller-owned action", async () => {
    const action = vi.fn().mockResolvedValue(hash);
    const transaction = {
      to: "0x2222222222222222222222222222222222222222",
      value: "0x1",
      data: "0x1234",
    };
    const scope = effectScope();
    const hook = scope.run(() => useSendTransaction(action))!;
    expect(action).not.toHaveBeenCalled();
    const pending = hook.sendTransaction(transaction);
    expect(hook.status.value).toBe("awaiting_approval");
    expect(hook.isSending.value).toBe(true);
    await expect(pending).resolves.toBe(hash);
    expect(action).toHaveBeenCalledWith(transaction);
    expect(action.mock.calls[0]![0]).toBe(transaction);
    expect(hook.status.value).toBe("submitted");
    expect(hook.isSending.value).toBe(false);
    scope.stop();
  });

  it("exposes a failed state and normalized error", async () => {
    const scope = effectScope();
    const hook = scope.run(() =>
      useSendTransaction(vi.fn().mockRejectedValue("rejected")),
    )!;
    await expect(
      hook.sendTransaction({
        to: "0x1111111111111111111111111111111111111111",
      }),
    ).rejects.toThrow("Transaction failed");
    expect(hook.status.value).toBe("failed");
    expect(hook.error.value?.message).toBe("Transaction failed");
    scope.stop();
  });

  it("reset prevents an older completion from replacing idle state", async () => {
    let resolve!: (value: string) => void;
    const action = vi.fn(() => new Promise<string>((done) => (resolve = done)));
    const scope = effectScope();
    const hook = scope.run(() => useSendTransaction(action))!;
    const pending = hook.sendTransaction({ to: "0x1" });
    hook.reset();
    resolve(hash);
    await pending;
    expect(hook.status.value).toBe("idle");
    expect(hook.error.value).toBeNull();
    scope.stop();
  });
});
