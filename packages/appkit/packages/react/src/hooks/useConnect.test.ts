/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useConnect } from "./useConnect";

function mockWeb3(overrides: Record<string, unknown> = {}) {
  return {
    connect: vi.fn(),
    status: "disconnected" as const,
    ...overrides,
  };
}

describe("useConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue(mockWeb3());
    const { result } = renderHook(() => useConnect());

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should call connect and succeed", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    mockUseWeb3.mockReturnValue(mockWeb3({ connect }));

    const { result } = renderHook(() => useConnect());

    await act(async () => {
      await result.current.connect();
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should set connecting state during connect", async () => {
    let resolvePromise: () => void;
    const connectPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    const connect = vi.fn().mockReturnValue(connectPromise);
    mockUseWeb3.mockReturnValue(mockWeb3({ connect }));

    const { result } = renderHook(() => useConnect());

    let connectCallPromise: Promise<void>;
    act(() => {
      connectCallPromise = result.current.connect();
    });

    expect(result.current.isConnecting).toBe(true);

    await act(async () => {
      resolvePromise!();
      await connectCallPromise!;
    });

    expect(result.current.isConnecting).toBe(false);
  });

  it("should capture error on failed connect", async () => {
    const testError = new Error("Connection rejected");
    const connect = vi.fn().mockRejectedValue(testError);
    mockUseWeb3.mockReturnValue(mockWeb3({ connect }));

    const { result } = renderHook(() => useConnect());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("Connection rejected");
  });

  it("should capture wallet error on failed connect", async () => {
    const { WalletError } = await import("@naculus/connect-core");
    const walletError = new WalletError("user_rejected", "User rejected");
    const connect = vi.fn().mockRejectedValue(walletError);
    mockUseWeb3.mockReturnValue(mockWeb3({ connect }));

    const { result } = renderHook(() => useConnect());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.error).toBeInstanceOf(WalletError);
  });

  it("should reflect connecting status from Web3Provider", () => {
    mockUseWeb3.mockReturnValue(mockWeb3({ status: "connecting" }));
    const { result } = renderHook(() => useConnect());

    expect(result.current.isConnecting).toBe(true);
  });
});
