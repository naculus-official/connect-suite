// @vitest-environment jsdom

import type { TokenConfig } from "@naculus/connect-core";
import { ERC20_MIN_ABI, parseUnits } from "@naculus/connect-core";
import { cleanup, renderHook } from "@testing-library/react";
import { encodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: undefined as { to: string; data: string; value: string } | undefined,
  chainId: undefined as number | undefined,
  simulationResult: undefined as unknown,
  simulating: false,
  simulationError: null as Error | null,
  account: {
    evmAccount: "0x1111111111111111111111111111111111111111",
    isConnected: true,
  },
}));

vi.mock("./useAccount", () => ({ useAccount: () => mocks.account }));
vi.mock("./useChain", () => ({
  useChain: () => ({ currentChain: { caip2: "eip155:1" } }),
}));
vi.mock("./useTransactionSimulation", () => ({
  useTransactionSimulation: (
    tx: typeof mocks.tx,
    chainId: number | undefined,
  ) => {
    mocks.tx = tx;
    mocks.chainId = chainId;
    return {
      result: mocks.simulationResult,
      isSimulating: mocks.simulating,
      error: mocks.simulationError,
      simulate: vi.fn(),
      reset: vi.fn(),
    };
  },
}));

import { useERC20TransferSimulation } from "./useERC20TransferSimulation";

const token: TokenConfig = {
  address: "0x5555555555555555555555555555555555555555",
  chainId: 1,
  decimals: 6,
};
const to = "0x2222222222222222222222222222222222222222" as const;

beforeEach(() => {
  mocks.tx = undefined;
  mocks.chainId = undefined;
  mocks.simulationResult = undefined;
  mocks.simulating = false;
  mocks.simulationError = null;
  mocks.account = {
    evmAccount: "0x1111111111111111111111111111111111111111",
    isConnected: true,
  };
});
afterEach(cleanup);

describe("useERC20TransferSimulation", () => {
  it("previews exactly the calldata the transfer hook sends", () => {
    renderHook(() =>
      useERC20TransferSimulation({ token, to, amount: "1.000001" }),
    );
    expect(mocks.chainId).toBe(1);
    expect(mocks.tx).toEqual({
      to: token.address,
      value: "0",
      data: encodeFunctionData({
        abi: ERC20_MIN_ABI,
        functionName: "transfer",
        args: [to, parseUnits("1.000001", 6)],
      }),
    });
  });

  it.each(["1.0000001", "-1", "1.2.3", "not a number"])(
    "does not preview a rejected amount %s",
    (amount) => {
      renderHook(() => useERC20TransferSimulation({ token, to, amount }));
      expect(mocks.tx).toBeUndefined();
    },
  );

  it("does not preview malformed recipients or unknown decimals", () => {
    const { rerender } = renderHook(
      ({ recipient, config }) =>
        useERC20TransferSimulation({
          token: config,
          to: recipient,
          amount: "1",
        }),
      { initialProps: { recipient: "0x123" as `0x${string}`, config: token } },
    );
    expect(mocks.tx).toBeUndefined();
    rerender({ recipient: to, config: { ...token, decimals: undefined } });
    expect(mocks.tx).toBeUndefined();
  });

  it("hides an old or late simulation result after inputs become invalid", () => {
    const previous = { status: "success", previous: true };
    const { result, rerender } = renderHook(
      ({ amount }) => useERC20TransferSimulation({ token, to, amount }),
      { initialProps: { amount: "1" } },
    );
    mocks.simulationResult = previous;
    rerender({ amount: "1" });
    expect(result.current.result).toEqual(previous);

    mocks.simulating = true;
    mocks.simulationError = new Error("old request");
    rerender({ amount: "1.0000001" });
    expect(mocks.tx).toBeUndefined();
    expect(result.current.result).toBeUndefined();
    expect(result.current.isSimulating).toBe(false);
    expect(result.current.error).toBeNull();

    // The old request completes after the current input is already invalid.
    mocks.simulationResult = { status: "success", late: true };
    rerender({ amount: "1.0000001" });
    expect(result.current.result).toBeUndefined();
  });
});
