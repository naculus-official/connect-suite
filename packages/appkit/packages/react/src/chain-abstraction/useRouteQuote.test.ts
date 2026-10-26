/// <reference types="vitest" />
/// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote, QuoteOptions } from "./useRouteQuote";
import { useRouteQuote } from "./useRouteQuote";

/**
 * Quote input comes straight from a text field, so the guard has to survive
 * whatever a user types. It used to call BigInt(amount) outside the try, and
 * BigInt throws on "1.5", "abc" and "1e18" — the exception escaped the
 * debounce timer instead of producing an empty list. `toToken` was also
 * declared on the input, destructured, and then never passed on, so a
 * cross-token quote asked for the source token on both sides.
 */

const base = {
  fromChain: "eip155:1",
  toChain: "eip155:137",
  fromToken: "USDC",
  amount: "1000000",
};

type GetQuoteFn = (
  from: string,
  to: string,
  token: string,
  amount: string,
  options?: QuoteOptions,
  toToken?: string,
) => Promise<Quote[]>;

let getQuote: ReturnType<typeof vi.fn<GetQuoteFn>>;

beforeEach(() => {
  vi.clearAllMocks();
  getQuote = vi.fn<GetQuoteFn>(async () => []);
});

describe("useRouteQuote — amount handling", () => {
  it.each(["1.5", "abc", "1e18", "-5", " ", "0x10"])(
    "returns an empty list for %p instead of throwing",
    async (amount) => {
      const { result } = renderHook(() =>
        useRouteQuote({ ...base, amount }, getQuote),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.quotes).toEqual([]);
      expect(getQuote).not.toHaveBeenCalled();
    },
  );

  it("does not quote a zero amount", async () => {
    renderHook(() => useRouteQuote({ ...base, amount: "0" }, getQuote));
    await new Promise((r) => setTimeout(r, 60));
    expect(getQuote).not.toHaveBeenCalled();
  });

  it("quotes a valid integer amount", async () => {
    renderHook(() => useRouteQuote(base, getQuote));
    await waitFor(() => expect(getQuote).toHaveBeenCalled());
  });
});

describe("useRouteQuote — parameters", () => {
  it("passes the destination token for a cross-token route", async () => {
    renderHook(() => useRouteQuote({ ...base, toToken: "USDT" }, getQuote));
    await waitFor(() => expect(getQuote).toHaveBeenCalled());
    expect(getQuote.mock.calls[0]).toContain("USDT");
  });

  it("passes chains, source token and amount", async () => {
    renderHook(() => useRouteQuote(base, getQuote));
    await waitFor(() => expect(getQuote).toHaveBeenCalled());
    const [from, to, token, amount] = getQuote.mock.calls[0];
    expect({ from, to, token, amount }).toEqual({
      from: "eip155:1",
      to: "eip155:137",
      token: "USDC",
      amount: "1000000",
    });
  });

  it("does nothing without a quote function", async () => {
    const { result } = renderHook(() => useRouteQuote(base));
    await new Promise((r) => setTimeout(r, 60));
    expect(result.current.quotes).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe("useRouteQuote — results", () => {
  it("exposes returned quotes", async () => {
    getQuote.mockResolvedValue([
      {
        routeId: "r1",
        provider: "lifi",
        netReceiveFormatted: "1.0",
        toTokenSymbol: "USDC",
      },
    ]);
    const { result } = renderHook(() => useRouteQuote(base, getQuote));
    await waitFor(() => expect(result.current.quotes).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });

  it("clears stale quotes when a request fails", async () => {
    // Leaving the previous route on screen after an error would let a user
    // act on a quote the provider has already disowned.
    getQuote.mockResolvedValueOnce([
      {
        routeId: "r1",
        provider: "lifi",
        netReceiveFormatted: "1.0",
        toTokenSymbol: "USDC",
      },
    ]);
    const { result, rerender } = renderHook(
      ({ amount }) => useRouteQuote({ ...base, amount }, getQuote),
      { initialProps: { amount: "1000000" } },
    );
    await waitFor(() => expect(result.current.quotes).toHaveLength(1));

    getQuote.mockRejectedValueOnce(new Error("provider down"));
    rerender({ amount: "2000000" });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.quotes).toEqual([]);
  });
});
