import { encodeErc20Transfer } from "@naculus/connect-appkit-core";
import { parseUnits } from "@naculus/connect-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref, toValue } from "vue";

const mocks = vi.hoisted(() => ({
  tx: undefined as unknown,
  chainId: undefined as unknown,
  result: undefined as unknown,
  isSimulating: false,
  error: null as Error | null,
}));

vi.mock("./useTransactionSimulation", () => ({
  useTransactionSimulation: (tx: unknown, options: { chainId: unknown }) => {
    mocks.tx = tx;
    mocks.chainId = options.chainId;
    return {
      result: ref(mocks.result),
      isSimulating: ref(mocks.isSimulating),
      error: ref(mocks.error),
      simulate: vi.fn(),
      reset: vi.fn(),
    };
  },
}));

import { useERC20TransferSimulation } from "./useERC20TransferSimulation";

const token = {
  address: "0x5555555555555555555555555555555555555555" as const,
  chainId: 1,
  decimals: 6,
};
const recipient = "0x2222222222222222222222222222222222222222";

beforeEach(() => {
  mocks.tx = undefined;
  mocks.chainId = undefined;
  mocks.result = undefined;
  mocks.isSimulating = false;
  mocks.error = null;
});

describe("useERC20TransferSimulation", () => {
  it("previews exactly the transfer calldata and token chain", () => {
    const scope = effectScope();
    scope.run(() =>
      useERC20TransferSimulation({
        token,
        to: recipient,
        amount: "1.000001",
        connected: true,
        evmAccount: "0x1111111111111111111111111111111111111111",
      }),
    );
    expect(toValue(mocks.chainId)).toBe(1);
    expect(toValue(mocks.tx)).toEqual({
      to: token.address,
      value: "0",
      data: encodeErc20Transfer(recipient, parseUnits("1.000001", 6)),
    });
    scope.stop();
  });

  it.each(["1.0000001", "-1", "not a number"])(
    "fails closed for rejected amount %s",
    (amount) => {
      const scope = effectScope();
      scope.run(() =>
        useERC20TransferSimulation({
          token,
          to: recipient,
          amount,
          connected: true,
          evmAccount: "0x1111111111111111111111111111111111111111",
        }),
      );
      expect(toValue(mocks.tx)).toBeUndefined();
      scope.stop();
    },
  );

  it("masks stale base state after inputs become invalid", () => {
    mocks.result = { status: "success" };
    mocks.isSimulating = true;
    mocks.error = new Error("old request");
    const amount = ref("1");
    const scope = effectScope();
    const hook = scope.run(() =>
      useERC20TransferSimulation({
        token,
        to: recipient,
        amount,
        connected: true,
        evmAccount: "0x1111111111111111111111111111111111111111",
      }),
    )!;
    expect(hook.result.value).toEqual({ status: "success" });
    amount.value = "1.0000001";
    expect(hook.result.value).toBeUndefined();
    expect(hook.isSimulating.value).toBe(false);
    expect(hook.error.value).toBeNull();
    scope.stop();
  });
});
