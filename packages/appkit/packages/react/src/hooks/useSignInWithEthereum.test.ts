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

import { useSignInWithEthereum } from "./useSignInWithEthereum";

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

describe("useSignInWithEthereum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignInWithEthereum());

    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("should throw when no session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithEthereum());

    await expect(result.current.signIn()).rejects.toThrow("No active session");
  });

  it("should throw when client not initialized", async () => {
    mockUseWeb3.mockReturnValue({ session: createEvmSession(), chainId: "eip155:1" });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignInWithEthereum());

    await expect(result.current.signIn()).rejects.toThrow("Client not initialized");
  });

  it("should throw when no EVM accounts in session", async () => {
    const solanaSession = {
      topic: "test-topic",
      namespaces: {
        solana: {
          chains: ["solana:4sGjMW1s"],
          accounts: ["solana:4sGjMW1s:5JG7DPRQAxJVCLx3GxsHTxP1KZbSyLmPQBLkLhFZPGrH"],
        },
      },
    };

    mockUseWeb3.mockReturnValue({ session: solanaSession, chainId: null });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithEthereum());

    await expect(result.current.signIn()).rejects.toThrow(
      "No EVM (eip155) accounts found in session"
    );
  });

  it("should reject an active non-EVM chain when no override is supplied", async () => {
    mockUseWeb3.mockReturnValue({
      session: {
        ...createEvmSession(),
        namespaces: {
          ...createEvmSession().namespaces,
          solana: {
            chains: ["solana:mainnet"],
            accounts: ["solana:mainnet:address"],
          },
        },
      },
      chainId: "solana:mainnet",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSignInWithEthereum());

    await expect(result.current.signIn()).rejects.toThrow(
      "Ethereum SIWx requires an eip155 chain",
    );
  });

  it("should reject a non-EVM chain override", async () => {
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSignInWithEthereum());

    await expect(
      result.current.signIn({ chainId: "solana:4sGjMW1s" }),
    ).rejects.toThrow("Ethereum SIWx requires an eip155 chain");
  });

  it("should sign in with Ethereum successfully", async () => {
    const mockSignature = "0xsiwsignature1234567890abcdef";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithEthereum());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn({
        statement: "Sign in to MyApp",
      });
    });

    expect(siwxResult!).toBeDefined();
    expect(siwxResult!.signature).toBe(mockSignature);
    expect(siwxResult!.message.domain).toBe("localhost:3000");
    expect(siwxResult!.message.address).toBe("0x1234567890123456789012345678901234567890");
    expect(siwxResult!.message.statement).toBe("Sign in to MyApp");
    expect(siwxResult!.message.version).toBe(1);
    expect(siwxResult!.message.chainId).toBe("eip155:1");
    expect(siwxResult!.message.nonce).toHaveLength(16);
    expect(siwxResult!.message.issuedAt).toBeTruthy();
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.result).toBe(siwxResult);
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

    const { result } = renderHook(() => useSignInWithEthereum());

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
    mockSignMessage.mockRejectedValue(new Error("User rejected"));
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithEthereum());

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe("User rejected");
  });

  it("should clear error", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSignInWithEthereum());

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it("should accept custom domain and URI", async () => {
    const mockSignature = "0xsig";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({
      signMessage: mockSignMessage,
    });

    const { result } = renderHook(() => useSignInWithEthereum());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn({
        domain: "app.example.com",
        uri: "https://app.example.com/login",
        expirySeconds: 3600,
        resources: ["https://app.example.com/privacy"],
      });
    });

    expect(siwxResult!.message.domain).toBe("app.example.com");
    expect(siwxResult!.message.uri).toBe("https://app.example.com/login");
    expect(siwxResult!.message.expirationTime).toBeTruthy();
    expect(siwxResult!.message.resources).toContain("https://app.example.com/privacy");
  });
});
