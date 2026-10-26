/// <reference types="vitest" />
/// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const load = vi.fn(async () => {});
const refresh = vi.fn(async () => {});
const getTokens = vi.fn(() => [] as unknown[]);

vi.mock("@naculus/connect-core", () => ({
  TokenListManager: class {
    load = load;
    refresh = refresh;
    getTokens = getTokens;
  },
}));

import { useTokenList } from "./useTokenList";

/**
 * The token list decides which assets a user can pick to send, and this file
 * had no coverage. The chain filter was derived with parseInt over the last
 * CAIP segment, which stops at the first non-digit: `solana:5eykt4Us…` became
 * 5, so asking for Solana mainnet returned Goerli's tokens.
 */

beforeEach(() => {
  vi.clearAllMocks();
  getTokens.mockReturnValue([]);
});

describe("useTokenList chain filtering", () => {
  it("filters by the numeric chain id for an EVM chain", async () => {
    renderHook(() => useTokenList("eip155:137"));
    await waitFor(() => expect(getTokens).toHaveBeenCalled());
    expect(getTokens).toHaveBeenCalledWith({ chainId: 137 });
  });

  it("does not filter by a bogus EVM id for a Solana chain", async () => {
    // The reference starts with 5, which used to be read as Goerli.
    renderHook(() =>
      useTokenList("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"),
    );
    await waitFor(() => expect(getTokens).toHaveBeenCalled());
    expect(getTokens).toHaveBeenCalledWith(undefined);
  });

  it("does not filter by chain 0 for XRPL", async () => {
    renderHook(() => useTokenList("xrpl:0"));
    await waitFor(() => expect(getTokens).toHaveBeenCalled());
    expect(getTokens).toHaveBeenCalledWith(undefined);
  });

  it("requests every token when no chain is given", async () => {
    renderHook(() => useTokenList());
    await waitFor(() => expect(getTokens).toHaveBeenCalled());
    expect(getTokens).toHaveBeenCalledWith(undefined);
  });
});

describe("useTokenList lifecycle", () => {
  it("loads automatically by default and reports completion", async () => {
    getTokens.mockReturnValue([{ symbol: "USDC" }]);
    const { result } = renderHook(() => useTokenList("eip155:1"));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(load).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tokens).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("does not load when autoLoad is false", () => {
    const { result } = renderHook(() =>
      useTokenList("eip155:1", { autoLoad: false }),
    );
    expect(load).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it("surfaces a load failure instead of reporting an empty list as loaded", async () => {
    // An empty list that claims to be loaded reads as "this chain has no
    // tokens", which is a different and misleading answer.
    load.mockRejectedValueOnce(new Error("registry down"));
    const { result } = renderHook(() => useTokenList("eip155:1"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/registry down/);
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("refetch goes through refresh, not the cached load", async () => {
    const { result } = renderHook(() =>
      useTokenList("eip155:1", { autoLoad: false }),
    );
    await result.current.refetch();
    expect(refresh).toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});
