/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useAccount } from "./useAccount";

describe("useAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null accounts when not connected", () => {
    mockUseWeb3.mockReturnValue({
      accounts: [],
      session: null,
      isConnected: false,
    });
    const { result } = renderHook(() => useAccount());

    expect(result.current.accounts).toBeNull();
    expect(result.current.evmAccount).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("should return null when accounts array is empty even if connected", () => {
    mockUseWeb3.mockReturnValue({
      accounts: [],
      session: { topic: "test" },
      isConnected: true,
    });
    const { result } = renderHook(() => useAccount());

    expect(result.current.accounts).toBeNull();
    expect(result.current.evmAccount).toBeNull();
  });

  it("should identify EVM accounts", () => {
    mockUseWeb3.mockReturnValue({
      accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
      session: { topic: "test" },
      isConnected: true,
    });
    const { result } = renderHook(() => useAccount());

    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.evmAccount).toBe("eip155:1:0x1234567890123456789012345678901234567890");
  });

  it("should identify plain 0x addresses as EVM", () => {
    mockUseWeb3.mockReturnValue({
      accounts: ["0xabcdef1234567890abcdef1234567890abcdef12"],
      session: { topic: "test" },
      isConnected: true,
    });
    const { result } = renderHook(() => useAccount());

    expect(result.current.evmAccount).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
  });
});
