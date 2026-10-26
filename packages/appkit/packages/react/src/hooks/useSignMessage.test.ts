/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockSignMessage = vi.fn();
const mockGetClient = vi.fn();
vi.mock("../client", () => ({
  getClient: () => mockGetClient(),
}));

import { useSignMessage } from "./useSignMessage";

function createMockSession() {
  return {
    topic: "test-topic",
    namespaces: {
      eip155: {
        chains: ["eip155:1"],
        accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
      },
    },
  };
}

describe("useSignMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignMessage());

    expect(result.current.isSigning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should throw when no session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignMessage());

    await expect(async () => {
      await act(async () => {
        await result.current.signMessage("hello");
      });
    }).rejects.toThrow("No active session");

    // Pre-condition checks throw directly without setting state
    expect(result.current.error).toBeNull();
  });

  it("should throw when client not initialized", async () => {
    mockUseWeb3.mockReturnValue({ session: createMockSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignMessage());

    await expect(async () => {
      await act(async () => {
        await result.current.signMessage("hello");
      });
    }).rejects.toThrow("Client not initialized");
  });

  it("should sign a message successfully", async () => {
    mockSignMessage.mockResolvedValue("0xsignature123");
    mockUseWeb3.mockReturnValue({ session: createMockSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignMessage());

    let signature: string;
    await act(async () => {
      signature = await result.current.signMessage("hello");
    });

    expect(signature!).toBe("0xsignature123");
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
    expect(mockSignMessage).toHaveBeenCalledWith(createMockSession(), {
      message: "hello",
      address: "eip155:1:0x1234567890123456789012345678901234567890",
      chainId: "eip155:1",
    });
    expect(result.current.isSigning).toBe(false);
  });

  it("should set loading state during signing", async () => {
    let resolvePromise: (v: string) => void;
    const signPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    mockSignMessage.mockReturnValue(signPromise);
    mockUseWeb3.mockReturnValue({ session: createMockSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignMessage());

    let callPromise: Promise<string>;
    act(() => {
      callPromise = result.current.signMessage("hello");
    });

    expect(result.current.isSigning).toBe(true);

    await act(async () => {
      resolvePromise!("0xsig");
      await callPromise!;
    });

    expect(result.current.isSigning).toBe(false);
  });

  it("should capture error on failed signing", async () => {
    mockSignMessage.mockRejectedValue(new Error("User rejected"));
    mockUseWeb3.mockReturnValue({ session: createMockSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignMessage());

    await act(async () => {
      try {
        await result.current.signMessage("hello");
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("User rejected");
  });
});
