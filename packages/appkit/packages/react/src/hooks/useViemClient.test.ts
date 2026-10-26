/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseAccount = vi.fn();
vi.mock("./useAccount", () => ({
  useAccount: () => mockUseAccount(),
}));

const mockUseChain = vi.fn();
vi.mock("./useChain", () => ({
  useChain: () => mockUseChain(),
}));

vi.mock("../utils/chains", () => ({
  getDefaultChains: () => [
    { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
  ],
}));

import { useViemClient } from "./useViemClient";

describe("useViemClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null clients when not connected", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });
    mockUseChain.mockReturnValue({
      currentChain: null,
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).toBeNull();
    expect(result.current.walletClient).toBeNull();
    expect(result.current.chains).toHaveLength(1);
  });

  it("should create public client when chain has rpcUrl", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "eip155:1",
        name: "Ethereum",
        rpcUrl: "https://eth.llamarpc.com",
        token: "ETH",
      },
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).not.toBeNull();
    expect(result.current.publicClient?.chain?.id).toBe(1);
    // walletClient should still be null since not connected
    expect(result.current.walletClient).toBeNull();
  });

  it("should create both public and wallet client when connected with evm account", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "eip155:1",
        name: "Ethereum",
        rpcUrl: "https://eth.llamarpc.com",
        token: "ETH",
      },
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).not.toBeNull();
    expect(result.current.walletClient).not.toBeNull();
    expect(result.current.walletClient?.account?.address).toBe("0x1234567890123456789012345678901234567890");
  });

  it("should handle plain address format (without eip155 prefix)", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: "0xabcdef1234567890abcdef1234567890abcdef12",
      isConnected: true,
    });
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "eip155:137",
        name: "Polygon",
        rpcUrl: "https://polygon-rpc.com",
        token: "MATIC",
      },
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).not.toBeNull();
    expect(result.current.walletClient).not.toBeNull();
    expect(result.current.walletClient?.account?.address).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
  });

  it("should return null wallet client when not connected", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: true,
    });
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "eip155:1",
        name: "Ethereum",
        rpcUrl: "https://eth.llamarpc.com",
        token: "ETH",
      },
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).not.toBeNull();
    expect(result.current.walletClient).toBeNull();
  });

  it("should return null clients when no rpcUrl", () => {
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "eip155:1",
        name: "Ethereum",
        rpcUrl: undefined,
        token: "ETH",
      },
    });

    const { result } = renderHook(() => useViemClient());

    expect(result.current.publicClient).toBeNull();
    expect(result.current.walletClient).toBeNull();
  });
});

describe("useViemClient — non-EVM chains", () => {
  // viem speaks to EVM nodes. Building a client with a stand-in number would
  // address a real chain that is not the one connected.
  it("builds no client for a Solana chain", () => {
    mockUseChain.mockReturnValue({
      currentChain: {
        caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        name: "Solana",
        rpcUrl: "https://api.mainnet-beta.solana.com",
      },
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useViemClient());
    expect(result.current.publicClient).toBeNull();
    expect(result.current.walletClient).toBeNull();
  });
});

describe("useViemClient — stability", () => {
  // The chain descriptor is rebuilt on every call, so an unmemoized one
  // changes identity each render and drives the client effects into a loop
  // that never settles. The clients holding still is the observable form of
  // that not happening.
  it("keeps the same client across renders while nothing changes", () => {
    const chain = {
      caip2: "eip155:1",
      name: "Ethereum",
      rpcUrl: "https://eth.llamarpc.com",
      token: "ETH",
    };
    mockUseChain.mockReturnValue({ currentChain: chain });
    mockUseAccount.mockReturnValue({
      evmAccount: "0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result, rerender } = renderHook(() => useViemClient());
    const firstPublic = result.current.publicClient;
    const firstWallet = result.current.walletClient;
    rerender();
    rerender();
    expect(result.current.publicClient).toBe(firstPublic);
    expect(result.current.walletClient).toBe(firstWallet);
  });
});
