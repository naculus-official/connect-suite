/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────

// Mock @naculus/connect-core to avoid @noble/hashes issues
vi.mock("@naculus/connect-core", async () => {
  // Import actual types for proper resolves, but provide a stub implementation
  const mod: any = {};
  // We'll just provide the class name so instanceof checks pass in tests
  return Object.assign(mod, {
    WalletError: class WalletError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.name = "WalletError";
        this.code = code;
      }
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    LocalStorageAdapter: vi.fn().mockImplementation(() => ({
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      isAvailable: vi.fn(() => true),
    })),
  });
});

// Mock @naculus/siwx to avoid transitive dependency chain issues with @noble/hashes
vi.mock("@naculus/siwx", () => {
  const mockCreateSiwxMessage = vi.fn((params) => {
    const lines = [
      `${params.domain} wants you to sign in with your ${params.blockchain ?? "blockchain"} account:`,
      params.address,
      ...(params.statement ? ["", params.statement] : []),
      "",
      `URI: ${params.uri}`,
      `Version: ${params.version ?? 1}`,
      `Chain ID: ${params.chainId}`,
      `Nonce: ${params.nonce}`,
      `Issued At: ${params.issuedAt}`,
    ];
    return lines.join("\n");
  });

  return {
    createSiwxMessage: mockCreateSiwxMessage,
    generateNonce: vi.fn(() => "mockNonce123"),
    issueNonce: vi.fn(async () => undefined),
    nowISO: vi.fn(() => new Date().toISOString()),
    getBlockchainName: vi.fn((chainId) => {
      if (chainId.startsWith("eip155:")) return "Ethereum";
      if (chainId.startsWith("solana:")) return "Solana";
      if (chainId.startsWith("xrpl:")) return "XRP Ledger";
      return "blockchain";
    }),
    // Type-only exports — provide minimal stubs
    checkSessionExpired: vi.fn((session) => {
      if (!session) return true;
      if (!session.expiresAt) return false;
      return new Date(session.expiresAt).getTime() <= Date.now();
    }),
    createLocalStorageSiwxSessionStorage: vi.fn((key) => ({
      async get() {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
          const session = JSON.parse(raw);
          if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
            localStorage.removeItem(key);
            return null;
          }
          return session;
        } catch {
          localStorage.removeItem(key);
          return null;
        }
      },
      async set(session: any) { localStorage.setItem(key, JSON.stringify(session)); },
      async remove() { localStorage.removeItem(key); },
      async has() { return localStorage.getItem(key) !== null; },
      async clear() { localStorage.removeItem(key); },
    })),
    createMemorySiwxSessionStorage: vi.fn(() => {
      const store = new Map();
      return {
        async get() { return store.get("default") ?? null; },
        async set(session: any) { store.set("default", JSON.stringify(session)); },
        async remove() { store.delete("default"); },
        async has() { return store.has("default"); },
        async clear() { store.clear(); },
      };
    }),
    SiwxSessionManager: vi.fn(),
    DEFAULT_SESSION_EXPIRY_SECONDS: 86_400,
    DEFAULT_SESSION_STORAGE_KEY: "naculus_siwx_session",
  };
});

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

import { useSIWxLogin } from "./useSIWxLogin";

// ── Fixtures ─────────────────────────────────────────────────────

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

describe("useSIWxLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSIWxLogin());

    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should throw when no session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

    await expect(result.current.signIn()).rejects.toThrow("No active session");
  });

  it("should throw when client not initialized", async () => {
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue(null);

    const { result } = renderHook(() => useSIWxLogin());

    await expect(result.current.signIn()).rejects.toThrow("Client not initialized");
  });

  it("should sign in with EVM account and return SiwxResult", async () => {
    const mockSignature = "0xevm_signature";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn({
        statement: "Sign in to test",
      });
    });

    expect(siwxResult).toBeDefined();
    expect(siwxResult!.signature).toBe(mockSignature);
    // jsdom sets location to localhost:3000 by default
    expect(siwxResult!.message.domain).toBe("localhost:3000");
    expect(siwxResult!.message.chainId).toBe("eip155:1");
    expect(siwxResult!.message.statement).toBe("Sign in to test");
    expect(siwxResult!.message.expirationTime).toBeDefined();
    expect(mockSignMessage).toHaveBeenCalledTimes(1);
  });

  it("should sign in with Solana account", async () => {
    const mockSignature = "solana_sig";
    mockSignMessage.mockResolvedValue(mockSignature);
    mockUseWeb3.mockReturnValue({
      session: createSolanaSession(),
      chainId: "solana:4sGjMW1s",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

    let siwxResult: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      siwxResult = await result.current.signIn();
    });

    expect(siwxResult!.message.chainId).toBe("solana:4sGjMW1s");
    expect(siwxResult!.message.blockchain).toBe("Solana");
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
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

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
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBe("User rejected");
  });

  it("should clear error via clearError", async () => {
    mockSignMessage.mockRejectedValue(new Error("Some error"));
    mockUseWeb3.mockReturnValue({
      session: createEvmSession(),
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });

    const { result } = renderHook(() => useSIWxLogin());

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // Expected
      }
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
