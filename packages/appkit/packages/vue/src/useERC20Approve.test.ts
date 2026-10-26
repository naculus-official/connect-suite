import { encodeErc20Approve } from "@naculus/connect-appkit-core";
import type { TokenConfig } from "@naculus/connect-core";
import { parseUnits } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useERC20Approve } from "./useERC20Approve";

const token = {
  address: "0x5555555555555555555555555555555555555555" as const,
  chainId: 1,
  decimals: 6,
};
const account = "0x1111111111111111111111111111111111111111";
const spender = "0x2222222222222222222222222222222222222222";
const hash = `0x${"cd".repeat(32)}` as `0x${string}`;

describe("useERC20Approve", () => {
  it("reads allowance, formats it, and approves shared-encoder calldata", async () => {
    const reader = {
      readContract: vi.fn().mockResolvedValue(parseUnits("2.5", 6)),
    };
    const send = vi.fn().mockResolvedValue(hash);
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Approve({
        token,
        spender,
        account,
        chainId: 1,
        connected: true,
        publicClient: reader,
        sendTransaction: send,
      }),
    )!;

    await expect(hook.refetchAllowance()).resolves.toBe(parseUnits("2.5", 6));
    expect(hook.allowance.value).toBe("2.5");
    await expect(hook.hasAllowance("2.499999")).resolves.toBe(true);
    await expect(hook.approve("1.000001")).resolves.toBe(hash);
    expect(send).toHaveBeenCalledWith({
      to: token.address,
      value: "0",
      data: encodeErc20Approve(spender, parseUnits("1.000001", 6)),
    });
    scope.stop();
  });

  it("rejects invalid spender and never calls the send action", async () => {
    const send = vi.fn();
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Approve({
        token,
        spender: "0x123" as `0x${string}`,
        account,
        chainId: 1,
        connected: true,
        publicClient: { readContract: vi.fn() },
        sendTransaction: send,
      }),
    )!;
    await expect(hook.approveMax()).rejects.toBeInstanceOf(TypeError);
    expect(send).not.toHaveBeenCalled();
    scope.stop();
  });

  it("does not approve with decimals read for a previous token", async () => {
    let resolveDecimals!: (value: number) => void;
    const reader = {
      readContract: vi.fn(
        () => new Promise<number>((resolve) => (resolveDecimals = resolve)),
      ),
    };
    const send = vi.fn();
    const selected = ref<TokenConfig>({ ...token, decimals: undefined });
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Approve({
        token: selected,
        spender,
        account,
        chainId: 1,
        connected: true,
        publicClient: reader,
        sendTransaction: send,
      }),
    )!;
    const pending = hook.approve("1");
    selected.value = {
      ...token,
      address: "0x6666666666666666666666666666666666666666",
    };
    resolveDecimals(6);
    await expect(pending).rejects.toMatchObject({ code: "session_inactive" });
    expect(send).not.toHaveBeenCalled();
    expect(hook.error.value).toBeNull();
    scope.stop();
  });
});
