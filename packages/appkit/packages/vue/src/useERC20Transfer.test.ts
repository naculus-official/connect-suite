import { encodeErc20Transfer } from "@naculus/connect-appkit-core";
import {
  parseUnits,
  type TokenConfig,
  type WalletError,
} from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useERC20Transfer } from "./useERC20Transfer";

const token = {
  address: "0x5555555555555555555555555555555555555555" as const,
  chainId: 1,
};
const account = "eip155:1:0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}` as `0x${string}`;

describe("useERC20Transfer", () => {
  it("reads missing decimals and sends shared-encoder calldata", async () => {
    const reader = { readContract: vi.fn().mockResolvedValue(6) };
    const send = vi.fn().mockResolvedValue(hash);
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Transfer({
        token,
        account,
        chainId: 1,
        connected: true,
        publicClient: reader,
        sendTransaction: send,
      }),
    )!;

    await expect(hook.sendTransfer(recipient, "1.000001")).resolves.toBe(hash);
    expect(reader.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "decimals" }),
    );
    expect(send).toHaveBeenCalledWith({
      to: token.address,
      value: "0",
      data: encodeErc20Transfer(recipient, parseUnits("1.000001", 6)),
    });
    scope.stop();
  });

  it("fails closed on a chain mismatch before reading or sending", async () => {
    const reader = { readContract: vi.fn() };
    const send = vi.fn();
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Transfer({
        token,
        account,
        chainId: 137,
        connected: true,
        publicClient: reader,
        sendTransaction: send,
      }),
    )!;
    await expect(hook.sendTransfer(recipient, "1")).rejects.toMatchObject({
      code: "chain_mismatch",
    } satisfies Partial<WalletError>);
    expect(reader.readContract).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    scope.stop();
  });

  it("does not send with decimals read for a previous token", async () => {
    let resolveDecimals!: (value: number) => void;
    const reader = {
      readContract: vi.fn(
        () => new Promise<number>((resolve) => (resolveDecimals = resolve)),
      ),
    };
    const send = vi.fn();
    const selected = ref<TokenConfig>(token);
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20Transfer({
        token: selected,
        account,
        chainId: 1,
        connected: true,
        publicClient: reader,
        sendTransaction: send,
      }),
    )!;
    const pending = hook.sendTransfer(recipient, "1");
    selected.value = {
      ...token,
      address: "0x6666666666666666666666666666666666666666",
    };
    resolveDecimals(6);
    await expect(pending).rejects.toMatchObject({ code: "session_inactive" });
    expect(send).not.toHaveBeenCalled();
    scope.stop();
  });
});
