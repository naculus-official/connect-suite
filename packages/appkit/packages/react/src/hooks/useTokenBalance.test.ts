/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Address } from "viem";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));

const mockUseAccount = vi.fn();
vi.mock("./useAccount", () => ({
  useAccount: () => mockUseAccount(),
}));

const mockReadContract = vi.fn();
const mockCreatePublicClient = vi.fn();
const mockFormatUnits = vi.fn((value: bigint, decimals: number) => {
  const str = value.toString();
  const padded = str.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals) || "0";
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fracPart ? intPart + "." + fracPart : intPart;
});

vi.mock("viem", () => ({
  createPublicClient: (...args: unknown[]) => mockCreatePublicClient(...args),
  http: (url: string) => ({ transport: "http", url }),
  formatUnits: (...args: [bigint, number]) => mockFormatUnits(...args),
}));

import { useTokenBalance } from "./useTokenBalance";
import type { TokenInfo } from "./useTokenBalance";

const USDC: TokenInfo = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
};

const DAI: TokenInfo = {
  address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address,
  symbol: "DAI",
  decimals: 18,
  name: "Dai Stablecoin",
};

describe("useTokenBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePublicClient.mockImplementation(({ chain }) => ({
      chain,
      readContract: mockReadContract,
    }));
  });

  it("should fetch a single token balance", async () => {
    mockReadContract.mockResolvedValue(BigInt("1000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC] }));

    await waitFor(() => {
      expect(mockReadContract).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.tokenBalances).toHaveLength(1);
    });
    expect(result.current.tokenBalances[0].balance).toBe("1000000");
    expect(result.current.tokenBalances[0].formatted).toBe("1");
    expect(result.current.tokenBalances[0].symbol).toBe("USDC");
    expect(result.current.tokenBalances[0].address).toBe(USDC.address);
  });

  it("should fetch multiple token balances", async () => {
    mockReadContract
      .mockResolvedValueOnce(BigInt("1000000"))
      .mockResolvedValueOnce(BigInt("5000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC, DAI] }));

    await waitFor(() => {
      expect(mockReadContract).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.tokenBalances).toHaveLength(2);
    });

    expect(result.current.tokenBalances[0].symbol).toBe("USDC");
    expect(result.current.tokenBalances[0].balance).toBe("1000000");
    expect(result.current.tokenBalances[0].formatted).toBe("1");
    expect(result.current.tokenBalances[1].symbol).toBe("DAI");
    expect(result.current.tokenBalances[1].balance).toBe("5000000000000000000");
    expect(result.current.tokenBalances[1].formatted).toBe("5");
  });

  it("should handle readContract error for a single token", async () => {
    mockReadContract.mockRejectedValue(new Error("RPC error"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC] }));

    await waitFor(() => {
      expect(result.current.tokenBalances[0]).toBeDefined();
    });

    expect(result.current.tokenBalances[0].balance).toBeNull();
    expect(result.current.tokenBalances[0].formatted).toBeNull();
    expect(result.current.tokenBalances[0].symbol).toBe("USDC");
  });

  it("should handle partial failure with multiple tokens", async () => {
    mockReadContract
      .mockResolvedValueOnce(BigInt("1000000"))
      .mockRejectedValueOnce(new Error("DAI error"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC, DAI] }));

    await waitFor(() => {
      expect(result.current.tokenBalances).toHaveLength(2);
    });

    expect(result.current.tokenBalances[0].symbol).toBe("USDC");
    expect(result.current.tokenBalances[0].balance).toBe("1000000");
    expect(result.current.tokenBalances[1].symbol).toBe("DAI");
    expect(result.current.tokenBalances[1].balance).toBeNull();
    expect(result.current.tokenBalances[1].formatted).toBeNull();
  });

  it("should return empty array when no tokens specified", async () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [] }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockReadContract).not.toHaveBeenCalled();
    expect(result.current.tokenBalances).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("should return empty array when not connected", async () => {
    mockUseWeb3.mockReturnValue({
      chainId: null,
      chains: [],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC] }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockReadContract).not.toHaveBeenCalled();
    expect(result.current.tokenBalances).toEqual([]);
  });

  it("should expose getTokenBalance helper", async () => {
    mockReadContract.mockResolvedValue(BigInt("1000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [USDC, DAI] }));

    await waitFor(() => {
      expect(mockReadContract).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.tokenBalances).toHaveLength(2);
    });

    const usdcResult = result.current.getTokenBalance(USDC.address);
    expect(usdcResult).toBeDefined();
    expect(usdcResult!.symbol).toBe("USDC");
    expect(usdcResult!.balance).toBe("1000000");

    const unknown = result.current.getTokenBalance("0x0000000000000000000000000000000000000000" as Address);
    expect(unknown).toBeUndefined();
  });

  it("should auto-refresh at specified interval", async () => {
    vi.useFakeTimers();
    mockReadContract.mockResolvedValue(BigInt("1000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    renderHook(() => useTokenBalance({ tokens: [USDC], refreshInterval: 10000 }));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(mockReadContract).toHaveBeenCalledTimes(1);

    mockReadContract.mockResolvedValue(BigInt("2000000"));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockReadContract).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockReadContract).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("should clear interval on unmount", async () => {
    vi.useFakeTimers();
    mockReadContract.mockResolvedValue(BigInt("1000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { unmount } = renderHook(() =>
      useTokenBalance({ tokens: [USDC], refreshInterval: 5000 })
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const callsAfterMount = mockReadContract.mock.calls.length;

    unmount();

    vi.advanceTimersByTime(10000);
    expect(mockReadContract).toHaveBeenCalledTimes(callsAfterMount);

    vi.useRealTimers();
  });

  it("should not auto-refresh when refreshInterval is 0", async () => {
    vi.useFakeTimers();
    mockReadContract.mockResolvedValue(BigInt("1000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    renderHook(() => useTokenBalance({ tokens: [USDC], refreshInterval: 0 }));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const callsAfterInit = mockReadContract.mock.calls.length;

    vi.advanceTimersByTime(30000);
    expect(mockReadContract).toHaveBeenCalledTimes(callsAfterInit);

    vi.useRealTimers();
  });

  it("should use chain token symbol as default when no tokens match", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [{ caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" }],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useTokenBalance({ tokens: [] }));
    expect(result.current.chain).toBeDefined();
    expect(result.current.chain!.name).toBe("Ethereum");
  });
});
