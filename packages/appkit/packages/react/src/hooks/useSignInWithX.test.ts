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

import { useSignInWithX } from "./useSignInWithX";

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

function createSolanaSession() {
  return {
    topic: "test-topic",
    namespaces: {
      solana: {
        chains: ["solana:4sGjMW1s"],
        accounts: ["solana:4sGjMW1s:5JG7DPRQAxJVCLx3GxsHTxP1KZbSyLmPQBLkLhFZPGrH"],
      },
    },
  };
}

describe("useSignInWithX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignInWithX());

    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should throw when no session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    await expect(result.current.signIn()).rejects.toThrow("No active session");
  });

  it("should throw when client not initialized", async () => {
    mockUseWeb3.mockReturnValue({ session: createEvmSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignInWithX());

    await expect(result.current.signIn()).rejects.toThrow("Client not initialized");
  });

  it("should sign in with the first available account (EVM)", async () => {
    const mockSignature = "0xgeneric_sig";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn({
        statement: "Generic SIWx sign in",
      });
    });

    expect(siwxResult!).toBeDefined();
    expect(siwxResult!.signature).toBe(mockSignature);
    expect(siwxResult!.message.address).toBe(
      "0x1234567890123456789012345678901234567890"
    );
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
  });

  it("should sign in with the first available account (Solana)", async () => {
    const mockSignature = "sol_gen_sig";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createSolanaSession(),
      chainId: "solana:4sGjMW1s",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn();
    });

    expect(siwxResult!.message.address).toBe(
      "5JG7DPRQAxJVCLx3GxsHTxP1KZbSyLmPQBLkLhFZPGrH"
    );
    expect(siwxResult!.message.chainId).toBe("solana:4sGjMW1s");
  });

  it("should set loading state during signing", async () => {
    let resolvePromise: (v: string) => void;
    const signPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    mockSignMessage.mockReturnValue(signPromise);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    let callPromise: Promise<unknown>;
    act(() => {
      callPromise = result.current.signIn();
    });

    expect(result.current.isSigningIn).toBe(true);

    await act(async () => {
      resolvePromise!("0xsig");
      await callPromise!;
    });

    expect(result.current.isSigningIn).toBe(false);
  });

  it("should capture error on failed signing", async () => {
    mockSignMessage.mockRejectedValue(new Error("Signature rejected"));
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("Signature rejected");
  });

  it("should set result after successful sign-in", async () => {
    mockSignMessage.mockResolvedValue("0xsig");
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithX());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn();
    });

    expect(result.current.result).toBe(siwxResult);
  });
});
