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

  describe("EIP-1193 wallet errors", () => {
    async function failWith(cause: unknown) {
      const scope = effectScope();
      const hook = scope.run(() =>
        useSignMessage(vi.fn().mockRejectedValue(cause)),
      )!;
      const thrown = await hook.signMessage("hello").catch((err) => err);
      const error = hook.error.value;
      scope.stop();
      return { error, thrown };
    }

    it("keeps code 4100 from a plain provider error object", async () => {
      const cause = {
        code: 4100,
        message:
          "The requested account and/or method has not been authorized by the user.",
      };
      const { error, thrown } = await failWith(cause);
      expect(error?.code).toBe(4100);
      expect(error?.message).toBe(cause.message);
      expect(error?.cause).toEqual({ code: 4100, message: cause.message });
      expect(error?.cause).not.toBe(cause);
      expect(thrown).toBe(error);
    });

    it("does not carry extra wallet fields on cause", async () => {
      const { error } = await failWith({
        code: 4100,
        message: "not authorized",
        data: { secret: "raw-payload" },
        extra: 1,
      });
      const c = error?.cause as Record<string, unknown>;
      expect(Object.keys(c).sort()).toEqual(["code", "message"]);
      expect(c).not.toHaveProperty("data");
      expect(c).not.toHaveProperty("extra");
      expect(error?.code).toBe(4100);
    });

    it("still surfaces a 4001 as a user rejection", async () => {
      const { error } = await failWith({
        code: 4001,
        message: "User rejected the request.",
      });
      expect(error?.code).toBe(4001);
      expect(error?.message).toBe("User rejected the request.");

      // An Error carrying 4001 is passed through as the same object.
      const rejection = Object.assign(new Error("User rejected the request."), {
        code: 4001,
      });
      const second = await failWith(rejection);
      expect(second.error).toBe(rejection);
    });

    it("keeps a generic Error unchanged and a bare failure generic", async () => {
      const generic = new Error("boom");
      const first = await failWith(generic);
      expect(first.error).toBe(generic);
      expect(first.error?.code).toBeUndefined();

      const second = await failWith({});
      expect(second.error?.message).toBe("Signing failed");
      expect(second.error?.code).toBeUndefined();
    });
  });
});
