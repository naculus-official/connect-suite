/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock useWeb3 before importing hooks
const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useWallet } from "./useWallet";
import type { Web3ContextValue } from "../provider/Web3ConnectProvider";

function createMockWeb3(overrides: Partial<Web3ContextValue> = {}): Web3ContextValue {
  const base: Web3ContextValue = {
    client: {} as Web3ContextValue["client"],
    status: "disconnected",
    session: null,
    accounts: [],
    chainId: null,
    error: null,
    isConnected: false,
    chains: [],
    sessionManager: null,
    clearError: () => {},
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    switchChain: vi.fn(),
    startPairing: vi.fn(),
    cancelPairing: vi.fn(),
    completePairing: vi.fn(),
    connectInjected: vi.fn(),
    connectEmbedded: vi.fn(),
    connectPasskeys: vi.fn(),
    ...overrides,
  };
  return base;
}

describe("useWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return disconnected state by default", () => {
    mockUseWeb3.mockReturnValue(createMockWeb3());
    const { result } = renderHook(() => useWallet());

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.status).toBe("disconnected");
    expect(result.current.currentAccount).toBeNull();
  });

  it("should reflect connected state", () => {
    mockUseWeb3.mockReturnValue(
      createMockWeb3({
        status: "connected",
        isConnected: true,
        accounts: ["eip155:1:0x1234"],
        chainId: "eip155:1",
      })
    );
    const { result } = renderHook(() => useWallet());

    expect(result.current.isConnected).toBe(true);
    expect(result.current.status).toBe("connected");
    expect(result.current.currentAccount).toBe("eip155:1:0x1234");
    expect(result.current.chainId).toBe("eip155:1");
  });

  it("should reflect connecting state", () => {
    mockUseWeb3.mockReturnValue(
      createMockWeb3({
        status: "connecting",
      })
    );
    const { result } = renderHook(() => useWallet());

    expect(result.current.isConnecting).toBe(true);
    expect(result.current.isConnected).toBe(false);
  });

  it("should reflect reconnecting state", () => {
    mockUseWeb3.mockReturnValue(
      createMockWeb3({
        status: "reconnecting",
      })
    );
    const { result } = renderHook(() => useWallet());

    expect(result.current.isReconnecting).toBe(true);
  });

  it("should pass through connect function", () => {
    const connect = vi.fn();
    mockUseWeb3.mockReturnValue(createMockWeb3({ connect }));
    const { result } = renderHook(() => useWallet());

    result.current.connect();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("should pass through disconnect function", () => {
    const disconnect = vi.fn();
    mockUseWeb3.mockReturnValue(createMockWeb3({ disconnect }));
    const { result } = renderHook(() => useWallet());

    result.current.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("should return null currentAccount when no accounts", () => {
    mockUseWeb3.mockReturnValue(createMockWeb3({ accounts: [] }));
    const { result } = renderHook(() => useWallet());

    expect(result.current.currentAccount).toBeNull();
  });

  it("should use first account as currentAccount", () => {
    mockUseWeb3.mockReturnValue(
      createMockWeb3({
        accounts: ["eip155:1:0xabc", "eip155:137:0xdef"],
      })
    );
    const { result } = renderHook(() => useWallet());

    expect(result.current.currentAccount).toBe("eip155:1:0xabc");
  });
});
