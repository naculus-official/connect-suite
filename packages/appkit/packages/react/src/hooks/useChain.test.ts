/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../utils/chains", () => {
  const chains = [
    { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
    { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
  ];
  return {
    getDefaultChains: () => chains,
    // A string comparison now. This mock used to carry its own copy of the
    // startsWith + parseInt reading, which is exactly the code being removed.
    getChainById: (ch: typeof chains, chainId: string) =>
      ch.find((c: (typeof chains)[0]) => c.caip2 === chainId),
  };
});

import { useChain } from "./useChain";

describe("useChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null chainId and null chainInfo when not connected", () => {
    mockUseWeb3.mockReturnValue({
      chainId: null,
      session: null,
      switchChain: vi.fn(),
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });

    const { result } = renderHook(() => useChain());

    expect(result.current.chainId).toBeNull();
    expect(result.current.currentChain).toBeNull();
    expect(result.current.chainInfo).toBeNull();
    // availableChains now returns all configured chains regardless of session
    expect(result.current.availableChains).toHaveLength(2);
  });

  it("should identify EVM chain", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      session: {
        topic: "test",
        namespaces: {
          eip155: {
            chains: ["eip155:1"],
            accounts: ["eip155:1:0x1234"],
          },
        },
      },
      switchChain: vi.fn(),
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });

    const { result } = renderHook(() => useChain());

    expect(result.current.isEvm).toBe(true);
    expect(result.current.currentChain?.name).toBe("Ethereum");
    expect(result.current.chainInfo?.name).toBe("Ethereum");
  });

  it("should return chainInfo as null when no session", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:137",
      session: null,
      switchChain: vi.fn(),
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });

    const { result } = renderHook(() => useChain());

    expect(result.current.chainInfo).toBeNull();
    expect(result.current.currentChain?.name).toBe("Polygon");
  });

  it("should return all configured chains as available", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      session: null,
      switchChain: vi.fn(),
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });

    const { result } = renderHook(() => useChain());

    // availableChains now returns all configured chains regardless of session
    expect(result.current.availableChains.length).toBeGreaterThanOrEqual(2);
    expect(result.current.availableChains.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["Ethereum", "Polygon"])
    );
  });

  it("should pass through switchChain function", () => {
    const switchChain = vi.fn();
    mockUseWeb3.mockReturnValue({
      chainId: null,
      session: null,
      switchChain,
      chains: [],
    });

    const { result } = renderHook(() => useChain());

    result.current.switchChain("eip155:137");
    expect(switchChain).toHaveBeenCalledWith("eip155:137");
  });

  it("should return chainInfo with selected=true", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:137",
      session: {
        topic: "test",
        namespaces: {
          eip155: {
            chains: ["eip155:137"],
            accounts: ["eip155:137:0x5678"],
          },
        },
      },
      switchChain: vi.fn(),
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });

    const { result } = renderHook(() => useChain());

    expect(result.current.chainInfo?.selected).toBe(true);
    expect(result.current.chainInfo?.namespace).toBe("eip155");
  });
});
