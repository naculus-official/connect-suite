/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUseAccount = vi.fn();
vi.mock("./useAccount", () => ({
  useAccount: () => mockUseAccount(),
}));

const mockGetNativeTokenPriceUsd = vi.fn().mockResolvedValue(null);
// Partial: the CAIP readers are real, so a chain-id parsing regression shows
// up here rather than being mocked away.
vi.mock("@naculus/connect-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@naculus/connect-core")>()),
  getNativeTokenPriceUsd: (...args: unknown[]) => mockGetNativeTokenPriceUsd(...args),
  clearPriceCache: vi.fn(),
}));

const mockGetBalance = vi.fn();
const mockCreatePublicClient = vi.fn();
vi.mock("viem", () => ({
  createPublicClient: (...args: unknown[]) => mockCreatePublicClient(...args),
  http: (url: string) => ({ transport: "http", url }),
  formatEther: (value: bigint) => {
    const str = value.toString();
    if (str === "0") return "0";
    const padded = str.padStart(19, "0");
    const intPart = padded.slice(0, padded.length - 18) || "0";
    const fracPart = padded.slice(padded.length - 18).replace(/0+$/, "");
    return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  },
}));

import { useBalance } from "./useBalance";

describe("useBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePublicClient.mockImplementation(({ chain }: { chain: { id: number } }) => ({
      chain,
      getBalance: mockGetBalance,
    }));
  });

  // M17/L11: Always restore real timers after each test to prevent timer leaks
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return null balance when not connected", () => {
    mockUseWeb3.mockReturnValue({
      chainId: null,
      chains: [],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useBalance());

    expect(result.current.balance).toBeNull();
    expect(result.current.formatted).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.chain).toBeNull();
    // No fallback symbol: this label is rendered beside the number, and
    // naming the wrong currency is a statement about what the user holds.
    expect(result.current.symbol).toBeNull();
  });

  it("should create client and fetch balance when connected", async () => {
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    // Wait for the useEffect to trigger fetchBalance
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetBalance).toHaveBeenCalledWith({
      address: "0x1234567890123456789012345678901234567890",
    });
    expect(result.current.balance).toBe("1000000000000000000");
    // 1 ETH formatted
    expect(result.current.formatted).toBe("1");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.chain?.name).toBe("Ethereum");
    // Reported because this chain actually declares it, not as a fallback.
    expect(result.current.symbol).toBe("ETH");
  });

  it("should handle plain 0x address format", async () => {
    mockGetBalance.mockResolvedValue(BigInt("500000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "0xabcdef1234567890abcdef1234567890abcdef12",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetBalance).toHaveBeenCalledWith({
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
    });
    expect(result.current.balance).toBe("500000000000000000");
    // 0.5 ETH formatted
    expect(result.current.formatted).toBe("0.5");
  });

  it("should not fetch balance when not connected", async () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetBalance).not.toHaveBeenCalled();
    expect(result.current.balance).toBeNull();
    expect(result.current.formatted).toBeNull();
  });

  it("should handle fetch error gracefully", async () => {
    mockGetBalance.mockRejectedValue(new Error("RPC error"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.balance).toBeNull();
    expect(result.current.formatted).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("RPC error");
  });

  it("should support refetch", async () => {
    mockGetBalance.mockResolvedValue(BigInt("2000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    // Initial fetch
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.balance).toBe("2000000000000000000");
    expect(result.current.formatted).toBe("2");

    // Refetch with new value
    mockGetBalance.mockResolvedValue(BigInt("3000000000000000000"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.balance).toBe("3000000000000000000");
    expect(result.current.formatted).toBe("3");
    expect(mockGetBalance).toHaveBeenCalledTimes(2);
  });

  it("should return null chain when unknown chainId", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:9999",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useBalance());

    expect(result.current.chain).toBeNull();
    // No fallback symbol: this label is rendered beside the number, and
    // naming the wrong currency is a statement about what the user holds.
    expect(result.current.symbol).toBeNull();
  });

  it("should auto-refresh at specified interval", async () => {
    vi.useFakeTimers();
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    renderHook(() => useBalance({ refreshInterval: 10000 }));

    // Initial fetch happens via useEffect — advance microtasks
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(mockGetBalance).toHaveBeenCalledTimes(1);

    // Advance time by the refresh interval
    mockGetBalance.mockResolvedValue(BigInt("2000000000000000000"));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockGetBalance).toHaveBeenCalledTimes(2);

    // Advance again
    mockGetBalance.mockResolvedValue(BigInt("3000000000000000000"));
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockGetBalance).toHaveBeenCalledTimes(3);
  });

  it("should clear interval on unmount", async () => {
    vi.useFakeTimers();
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { unmount } = renderHook(() => useBalance({ refreshInterval: 5000 }));

    // Advance microtasks for initial fetch
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const callsAfterMount = mockGetBalance.mock.calls.length;

    unmount();

    // Advance time — should NOT trigger another fetch
    vi.advanceTimersByTime(10000);

    expect(mockGetBalance).toHaveBeenCalledTimes(callsAfterMount);
  });

  it("should not auto-refresh when refreshInterval is 0", async () => {
    vi.useFakeTimers();
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000"));
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    renderHook(() => useBalance({ refreshInterval: 0 }));

    // Advance microtasks for initial fetch
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    const callsAfterInit = mockGetBalance.mock.calls.length;

    // Advance time should not trigger more calls
    vi.advanceTimersByTime(30000);

    expect(mockGetBalance).toHaveBeenCalledTimes(callsAfterInit);
  });

  it("should use chain token symbol when available", () => {
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:137",
      chains: [
        { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://polygon-rpc.com", token: "MATIC" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useBalance());

    expect(result.current.symbol).toBe("MATIC");
  });

  it("should return usdPrice and usdValue when price oracle succeeds", async () => {
    mockGetNativeTokenPriceUsd.mockResolvedValue(3500.50);
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000")); // 1 ETH
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.usdPrice).toBe(3500.50);
    expect(result.current.usdValue).toBe("$3,500.50");
    expect(mockGetNativeTokenPriceUsd).toHaveBeenCalledWith("eip155:1", "https://eth.llamarpc.com");
  });

  it("should return null usd fields when price oracle fails", async () => {
    mockGetNativeTokenPriceUsd.mockRejectedValue(new Error("Network error"));
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000000")); // 1 ETH
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Balance should still be fetched, USD should be null
    expect(result.current.balance).toBe("1000000000000000000");
    expect(result.current.formatted).toBe("1");
    expect(result.current.usdPrice).toBeNull();
    expect(result.current.usdValue).toBeNull();
  });

  it("should return null usd fields when not connected", () => {
    mockUseWeb3.mockReturnValue({
      chainId: null,
      chains: [],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: null,
      isConnected: false,
    });

    const { result } = renderHook(() => useBalance());

    expect(result.current.usdPrice).toBeNull();
    expect(result.current.usdValue).toBeNull();
  });

  it("should format small balances in USD correctly", async () => {
    mockGetNativeTokenPriceUsd.mockResolvedValue(3500.50);
    mockGetBalance.mockResolvedValue(BigInt("1000000000000000")); // 0.001 ETH
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.formatted).toBe("0.001");
    expect(result.current.usdValue).toBe("$3.50");
  });

  it("should update formatted balance when balance changes", async () => {
    mockGetBalance.mockResolvedValue(BigInt("1500000000000000000")); // 1.5 ETH
    mockUseWeb3.mockReturnValue({
      chainId: "eip155:1",
      chains: [
        { caip2: "eip155:1", name: "Ethereum", rpcUrl: "https://eth.llamarpc.com", token: "ETH" },
      ],
    });
    mockUseAccount.mockReturnValue({
      evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
      isConnected: true,
    });

    const { result } = renderHook(() => useBalance());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.formatted).toBe("1.5");
  });
});
