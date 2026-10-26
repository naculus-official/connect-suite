/// <reference types="vitest" />
/// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));
const mockResolveClient = vi.fn();
vi.mock("./client-resolver", () => ({
  resolveClient: (c: unknown) => mockResolveClient(c),
}));

import { useSolanaAccount } from "./useSolanaAccount";
import { useSolanaBalance } from "./useSolanaBalance";

const SOL_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const ADDRESS = "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW";

function web3(accounts: string[], connected = true) {
  mockUseWeb3.mockReturnValue({ accounts, isConnected: connected, client: {}, session: {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveClient.mockReturnValue({ solanaRpcUrl: "https://rpc.test" });
});
afterEach(() => vi.unstubAllGlobals());

describe("useSolanaAccount", () => {
  it("finds the Solana account among the session's namespaces", () => {
    web3([`eip155:1:0x${"11".repeat(20)}`, `${SOL_CHAIN}:${ADDRESS}`]);
    const { result } = renderHook(() => useSolanaAccount());
    expect(result.current.address).toBe(ADDRESS);
    expect(result.current.chainId).toBe(SOL_CHAIN);
  });

  it("is null when only an EVM account is connected", () => {
    web3([`eip155:1:0x${"11".repeat(20)}`]);
    const { result } = renderHook(() => useSolanaAccount());
    expect(result.current.address).toBeNull();
  });

  it("is null when nothing is connected", () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`], false);
    const { result } = renderHook(() => useSolanaAccount());
    expect(result.current.address).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  // The cluster reference is itself base58 and contains no colon, but taking
  // the last segment rather than index 2 keeps this correct if it ever does.
  it("takes the address as the last segment", () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    const { result } = renderHook(() => useSolanaAccount());
    expect(result.current.caip10).toBe(`${SOL_CHAIN}:${ADDRESS}`);
    expect(result.current.address).toBe(ADDRESS);
  });
});

describe("useSolanaBalance", () => {
  function rpc(...responses: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => responses.shift() ?? { result: { value: null } },
      })),
    );
  }

  it("reads the connected account's balance", async () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    rpc({ result: { value: 1_500_000_000 } }, { result: { value: {} } });
    const { result } = renderHook(() => useSolanaBalance());
    await waitFor(() => expect(result.current.balance).not.toBeNull());
    expect(result.current.balance?.sol).toBe("1.5");
  });

  // A zero placeholder is a number a user reads as their balance.
  it("stays null rather than showing zero before it knows", () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    rpc({ result: { value: 1_000_000_000 } });
    const { result } = renderHook(() => useSolanaBalance());
    expect(result.current.balance).toBeNull();
  });

  it("clears the balance when a read fails, rather than leaving it stale", async () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    rpc({ result: { value: 5_000_000_000 } }, { result: { value: {} } });
    const { result, rerender } = renderHook(() => useSolanaBalance());
    await waitFor(() => expect(result.current.balance?.sol).toBe("5"));

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    await result.current.refetch();
    rerender();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.balance).toBeNull();
  });

  // Not configured is a different fact from a balance of zero, and the only
  // one a caller can do something about.
  it("says when no RPC endpoint is configured", () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    mockResolveClient.mockReturnValue({ solanaRpcUrl: null });
    const { result } = renderHook(() => useSolanaBalance());
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.balance).toBeNull();
  });

  it("does not read anything without a connected account", () => {
    web3([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useSolanaBalance());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads an explicit address over the connected one", async () => {
    web3([`${SOL_CHAIN}:${ADDRESS}`]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { value: 1 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useSolanaBalance({ address: "OtherAddress" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.params[0]).toBe("OtherAddress");
  });
});
