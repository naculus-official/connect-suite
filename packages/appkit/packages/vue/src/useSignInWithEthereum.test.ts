import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import type { SiwxResult, SiwxSignInAction } from "./siwx";
import { useSignInWithEthereum } from "./useSignInWithEthereum";

const result: SiwxResult = {
  message: {
    chainId: "eip155:1",
    address: "0xabc",
    domain: "example.com",
  },
  signature: "0xsig",
};

describe("useSignInWithEthereum", () => {
  it("passes options and results unchanged to the current caller-owned action", async () => {
    const first = vi.fn<SiwxSignInAction>().mockResolvedValue(result);
    const secondResult: SiwxResult = {
      ...result,
      signature: "0xsecond",
    };
    const second = vi.fn<SiwxSignInAction>().mockResolvedValue(secondResult);
    const action = ref<SiwxSignInAction>(first);
    const options = { chainId: "eip155:1", requestId: "request" };
    const scope = effectScope();
    const state = scope.run(() => useSignInWithEthereum(action))!;

    action.value = second;
    await expect(state.signIn(options)).resolves.toBe(secondResult);
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls[0]![0]).toBe(options);
    expect(state.result.value).toBe(secondResult);

    scope.stop();
  });
});
