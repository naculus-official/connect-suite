import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useSolanaTransaction } from "./useSolanaTransaction";

describe("useSolanaTransaction", () => {
  it("passes raw transaction bytes unchanged to sign and send actions", async () => {
    const transaction = new Uint8Array([0, 1, 2, 255]);
    const signed = new Uint8Array([3, 4, 5]);
    const signTransaction = vi.fn().mockResolvedValue(signed);
    const sendTransaction = vi.fn().mockResolvedValue("base58-signature");
    const getStatus = vi
      .fn()
      .mockResolvedValue({ status: "confirmed", error: null });
    const scope = effectScope();
    const hook = scope.run(() =>
      useSolanaTransaction({ signTransaction, sendTransaction, getStatus }),
    )!;

    await expect(hook.signTransaction(transaction)).resolves.toBe(signed);
    await expect(hook.sendTransaction(transaction)).resolves.toBe(
      "base58-signature",
    );
    expect(signTransaction.mock.calls[0]![0]).toBe(transaction);
    expect(sendTransaction.mock.calls[0]![0]).toBe(transaction);
    expect(hook.isSigning.value).toBe(false);
    expect(hook.isSending.value).toBe(false);
    scope.stop();
  });

  it("passes base64 and signature strings unchanged", async () => {
    const signTransaction = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const sendTransaction = vi.fn().mockResolvedValue("signature");
    const getStatus = vi
      .fn()
      .mockResolvedValue({ status: "unknown", error: null });
    const scope = effectScope();
    const hook = scope.run(() =>
      useSolanaTransaction({ signTransaction, sendTransaction, getStatus }),
    )!;
    await hook.signTransaction("AAEC/w==");
    await hook.sendTransaction("AAEC/w==");
    await expect(hook.getStatus("signature")).resolves.toEqual({
      status: "unknown",
      error: null,
    });
    expect(signTransaction).toHaveBeenCalledWith("AAEC/w==");
    expect(sendTransaction).toHaveBeenCalledWith("AAEC/w==");
    expect(getStatus).toHaveBeenCalledWith("signature");
    scope.stop();
  });

  it("normalizes action failures and reset clears the shared error", async () => {
    const scope = effectScope();
    const hook = scope.run(() =>
      useSolanaTransaction({
        signTransaction: vi.fn().mockRejectedValue("no signature"),
        sendTransaction: vi.fn().mockRejectedValue("no send"),
        getStatus: vi.fn(async () => ({
          status: "unknown" as const,
          error: null,
        })),
      }),
    )!;
    await expect(hook.signTransaction("tx")).rejects.toThrow("Signing failed");
    expect(hook.error.value?.message).toBe("Signing failed");
    await expect(hook.sendTransaction("tx")).rejects.toThrow("Send failed");
    expect(hook.error.value?.message).toBe("Send failed");
    hook.reset();
    expect(hook.error.value).toBeNull();
    scope.stop();
  });
});
