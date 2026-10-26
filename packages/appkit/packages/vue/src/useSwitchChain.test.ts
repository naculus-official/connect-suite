import { describe, expect, it, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { useSwitchChain } from "./useSwitchChain";

describe("useSwitchChain", () => {
  it("passes the selected CAIP-2 target to the action captured at invocation", async () => {
    let finish!: () => void;
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const second = vi.fn(async () => {});
    const action = shallowRef(first);
    const chainId = ref("eip155:1");
    const scope = effectScope();
    const result = scope.run(() => useSwitchChain(action, chainId));
    if (!result) throw new Error("No composable result");
    expect(first).not.toHaveBeenCalled();
    const pending = result.switchChain("eip155:137");
    action.value = second;
    expect(first).toHaveBeenCalledWith("eip155:137");
    expect(second).not.toHaveBeenCalled();
    expect(result.isSwitching.value).toBe(true);
    finish();
    await pending;
    chainId.value = "eip155:137";
    expect(result.currentChainId.value).toBe("eip155:137");
    expect(result.isSwitching.value).toBe(false);
    scope.stop();
  });

  it("preserves user rejection vs unsupported-chain errors and permits clearing", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("cancelled"), { code: 4001 }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("unknown"), { code: 4902 }),
      );
    const scope = effectScope();
    const result = scope.run(() => useSwitchChain(action, null));
    if (!result) throw new Error("No composable result");
    await expect(result.switchChain("eip155:1")).rejects.toMatchObject({
      code: "chain_switch_rejected",
    });
    expect(result.error.value?.code).toBe("chain_switch_rejected");
    result.clearError();
    expect(result.error.value).toBeNull();
    await expect(result.switchChain("eip155:137")).rejects.toMatchObject({
      code: "chain_unsupported",
    });
    expect(result.error.value?.code).toBe("chain_unsupported");
    scope.stop();
  });

  it("does not overwrite the current error with a late older failure", async () => {
    let failOld!: (reason: unknown) => void;
    const action = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failOld = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const scope = effectScope();
    const result = scope.run(() => useSwitchChain(action, "eip155:1"));
    if (!result) throw new Error("No composable result");
    const old = result.switchChain("eip155:10");
    await result.switchChain("eip155:137");
    failOld(Object.assign(new Error("late rejection"), { code: 4001 }));
    await expect(old).rejects.toMatchObject({ code: "chain_switch_rejected" });
    expect(result.error.value).toBeNull();
    scope.stop();
  });
});
