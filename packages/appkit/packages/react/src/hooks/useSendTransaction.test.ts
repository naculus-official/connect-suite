/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const mockGetClient = vi.fn();
vi.mock("../client", () => ({
  getClient: () => mockGetClient(),
}));

import { useSendTransaction } from "./useSendTransaction";

const TX_HASH = `0x${"ab".repeat(32)}`;

function createEvmSession() {
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

describe("useSendTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSendTransaction());

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should throw when no session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue({
      sendTransaction: vi.fn(),
    });

    const { result } = renderHook(() => useSendTransaction());

    await expect(async () => {
      await act(async () => {
        await result.current.sendTransaction({ to: "0xabcd" });
      });
    }).rejects.toThrow("No active session");

    // Pre-condition checks throw directly without setting state
    expect(result.current.error).toBeNull();
  });

  it("should throw when client not initialized", async () => {
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSendTransaction());

    await expect(async () => {
      await act(async () => {
        await result.current.sendTransaction({ to: "0xabcd" });
      });
    }).rejects.toThrow("Client not initialized");
  });

  it("should send transaction successfully", async () => {
    const mockSendTransaction = vi.fn().mockResolvedValue(TX_HASH);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      sendTransaction: mockSendTransaction,
    });

    const { result } = renderHook(() => useSendTransaction());

    let txHash: string;
    await act(async () => {
      txHash = await result.current.sendTransaction({
        to: "0xabcd",
        value: "0xde0b6b3a7640000",
      });
    });

    expect(txHash!).toBe(TX_HASH);
    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).toHaveBeenCalledWith(createEvmSession(), {
      transaction: {
        to: "0xabcd",
        value: "0xde0b6b3a7640000",
        from: "0x1234567890123456789012345678901234567890",
      },
      chainId: "eip155:1",
    });
    expect(result.current.isSending).toBe(false);
  });

  it("extracts the hash from an embedded transaction result", async () => {
    const mockSendTransaction = vi.fn().mockResolvedValue({
      hash: TX_HASH,
      from: "0x1234567890123456789012345678901234567890",
      to: "0x1234567890123456789012345678901234567890",
      chainId: "eip155:1",
    });
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({ sendTransaction: mockSendTransaction });

    const { result } = renderHook(() => useSendTransaction());

    let txHash: string;
    await act(async () => {
      txHash = await result.current.sendTransaction({
        to: "0x1234567890123456789012345678901234567890",
        value: "0x1",
      });
    });

    expect(txHash!).toBe(TX_HASH);
    expect(result.current.status).toBe("submitted");
  });

  it("fails closed when a connector returns no valid transaction hash", async () => {
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      sendTransaction: vi.fn().mockResolvedValue({ hash: "not-a-hash" }),
    });

    const { result } = renderHook(() => useSendTransaction());

    await act(async () => {
      await expect(
        result.current.sendTransaction({
          to: "0x1234567890123456789012345678901234567890",
        }),
      ).rejects.toThrow("valid 32-byte transaction hash");
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error?.message).toContain(
      "valid 32-byte transaction hash",
    );
  });

  it("should throw when no EVM account found", async () => {
    const sessionWithoutEvm = {
      topic: "test",
      namespaces: {},
    };
    mockUseWeb3.mockReturnValue({ session: sessionWithoutEvm, chainId: null });
    mockGetClient.mockReturnValue({
      sendTransaction: vi.fn(),
    });

    const { result } = renderHook(() => useSendTransaction());

    await expect(async () => {
      await act(async () => {
        await result.current.sendTransaction({ to: "0xabcd" });
      });
    }).rejects.toThrow("No EVM account found");
  });

  it("should set loading state during sending", async () => {
    let resolvePromise: (v: string) => void;
    const sendPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const mockSendTransaction = vi.fn().mockReturnValue(sendPromise);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      sendTransaction: mockSendTransaction,
    });

    const { result } = renderHook(() => useSendTransaction());

    let callPromise: Promise<string>;
    act(() => {
      callPromise = result.current.sendTransaction({ to: "0xabcd" });
    });

    expect(result.current.isSending).toBe(true);

    await act(async () => {
      resolvePromise!(TX_HASH);
      await callPromise!;
    });

    expect(result.current.isSending).toBe(false);
  });

  it("should capture error on failed send", async () => {
    const mockSendTransaction = vi
      .fn()
      .mockRejectedValue(new Error("Transaction rejected"));
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      sendTransaction: mockSendTransaction,
    });

    const { result } = renderHook(() => useSendTransaction());

    await act(async () => {
      try {
        await result.current.sendTransaction({ to: "0xabcd" });
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("Transaction rejected");
  });
});
