/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useDisconnect } from "./useDisconnect";

function mockWeb3(overrides: Record<string, unknown> = {}) {
  return {
    disconnect: vi.fn(),
    status: "connected" as const,
    ...overrides,
  };
}

describe("useDisconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue(mockWeb3());
    const { result } = renderHook(() => useDisconnect());

    expect(result.current.isDisconnecting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should call disconnect and succeed when connected", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    mockUseWeb3.mockReturnValue(mockWeb3({ disconnect }));

    const { result } = renderHook(() => useDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("should not call disconnect if already disconnected", async () => {
    const disconnect = vi.fn();
    mockUseWeb3.mockReturnValue(mockWeb3({ disconnect, status: "disconnected" }));

    const { result } = renderHook(() => useDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnect).not.toHaveBeenCalled();
  });

  it("should capture error on failed disconnect", async () => {
    const disconnect = vi.fn().mockRejectedValue(new Error("Disconnect failed"));
    mockUseWeb3.mockReturnValue(mockWeb3({ disconnect }));

    const { result } = renderHook(() => useDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("Disconnect failed");
  });
});
