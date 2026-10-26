import { describe, expect, it } from "vitest";
import {
  compareCostsKey,
  isPositiveIntegerAmount,
  isQuotableInput,
  toExecuteRouteError,
  validateRouteRecipient,
} from "./routing";

describe("routing decisions", () => {
  it("only a positive base-unit integer is quotable", () => {
    expect(isPositiveIntegerAmount("1")).toBe(true);
    expect(isPositiveIntegerAmount("1000000000000000000")).toBe(true);
    for (const bad of ["0", "1.5", "abc", "1e18", "-1", "01", ""]) {
      expect(isPositiveIntegerAmount(bad)).toBe(false);
    }
    expect(
      isQuotableInput({
        fromChain: "eip155:1",
        toChain: "eip155:10",
        fromToken: "USDC",
        amount: "5",
      }),
    ).toBe(true);
    expect(
      isQuotableInput({
        fromChain: "",
        toChain: "eip155:10",
        fromToken: "USDC",
        amount: "5",
      }),
    ).toBe(false);
  });

  it("keys compare-costs input by value, with sorted option keys", () => {
    const a = compareCostsKey({
      operation: "swap",
      chains: ["eip155:1", "eip155:10"],
      options: { token: "USDC", amount: "1", nested: { x: 1 } },
    });
    const b = compareCostsKey({
      operation: "swap",
      chains: ["eip155:1", "eip155:10"],
      options: { nested: { y: 2 }, amount: "1", token: "USDC" },
    });
    expect(a).toBe(b);
    expect(a).toBe(
      "swap|eip155:1,eip155:10|amount=1&nested=[object]&token=USDC",
    );
    expect(compareCostsKey({ operation: "swap", chains: [] })).toBe("swap||");
  });

  it("validates the recipient for the quote's destination namespace only", () => {
    const evm = "0x1111111111111111111111111111111111111111";
    const sol = "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW";
    expect(validateRouteRecipient(undefined, "  ")?.code).toBe(
      "invalid_recipient",
    );
    expect(
      validateRouteRecipient(
        { routeId: "r", provider: "p", toChain: "eip155:10" },
        evm,
      ),
    ).toBeNull();
    expect(
      validateRouteRecipient(
        { routeId: "r", provider: "p", toChain: "eip155:10" },
        sol,
      )?.message,
    ).toMatch(/not a valid eip155 address/);
    // No toChain: not this function's call.
    expect(
      validateRouteRecipient({ routeId: "r", provider: "p" }, sol),
    ).toBeNull();
  });

  it("normalizes executor failures", () => {
    expect(toExecuteRouteError(new Error("boom"))).toEqual({
      code: "execution_failed",
      message: "boom",
      details: undefined,
    });
    expect(
      toExecuteRouteError({
        code: "timeout",
        message: "slow",
        details: { ms: 1 },
      }),
    ).toEqual({ code: "timeout", message: "slow", details: { ms: 1 } });
  });
});
