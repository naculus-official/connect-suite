/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── localStorage polyfill for Node 26 ────────────────────────────

if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  const lsMock = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Proxy(lsMock, {
      ownKeys: () => Object.keys(store),
      getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
    }),
    writable: true, configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: new Proxy(lsMock, {
        ownKeys: () => Object.keys(store),
        getOwnPropertyDescriptor: () => ({ configurable: true, enumerable: true }),
      }),
      writable: true, configurable: true,
    });
  }
}

// ── Mocks ────────────────────────────────────────────────────────

// Mock @naculus/connect-core to avoid @noble/hashes issues
vi.mock("@naculus/connect-core", () => ({
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
}));

// Mock @naculus/siwx to avoid transitive dependency chain issues
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

  const mockCheckSessionExpired = vi.fn((session: any) => {
    if (!session) return true;
    if (!session.expiresAt) return false;
    return new Date(session.expiresAt).getTime() <= Date.now();
  });

  function makeLocalStorageStorage(key: string) {
    return {
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
        async set(session: any) {
          localStorage.setItem(key, JSON.stringify(session));
        },
        async remove() {
          localStorage.removeItem(key);
        },
        async has() {
          return localStorage.getItem(key) !== null;
        },
        async clear() {
          localStorage.removeItem(key);
        },
      };
    }

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
    checkSessionExpired: mockCheckSessionExpired,
    createLocalStorageSiwxSessionStorage: vi.fn((key) => makeLocalStorageStorage(key)),
    createMemorySiwxSessionStorage: vi.fn(() => {
      const _store = new Map<string, string>();
      return {
        async get() { return null; },
        async set(session: any) {},
        async remove() {},
        async has() { return false; },
        async clear() {},
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

import { useSIWxSession } from "./useSIWxSession";

// ── Test Fixtures ────────────────────────────────────────────────

function createSiwxSession(overrides: Record<string, unknown> = {}) {
  const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1h from now
  const messageOverrides = (overrides.message as Record<string, unknown> | undefined) ?? {};
  return {
    id: "siwx_test_abc",
    chainId: "eip155:1",
    address: "eip155:1:0x1234567890123456789012345678901234567890",
    domain: "localhost",
    message: {
      raw: "localhost wants you to sign in with your Ethereum account:...",
      domain: "localhost",
      address: "eip155:1:0x1234567890123456789012345678901234567890",
      statement: "Sign in to test",
      uri: "http://localhost",
      version: 1,
      chainId: "eip155:1",
      nonce: "abc123xyz",
      issuedAt: new Date().toISOString(),
      expirationTime: expiresAt,
      notBefore: null,
      resources: [],
      requestId: null,
      blockchain: "Ethereum",
      ...messageOverrides,
    },
    signature: "0xdeadbeef",
    issuedAt: new Date().toISOString(),
    expiresAt,
    refreshedAt: null,
    ...overrides,
  };
}

// ── Storage Helpers ──────────────────────────────────────────────

function setLocalStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocalStorage(key: string) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : null;
}

function clearLocalStorage() {
  const keys = Object.keys(localStorage);
  keys.forEach((k) => localStorage.removeItem(k));
}

// ── Tests ───────────────────────────────────────────────────────

describe("useSIWxSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalStorage();

    mockSignMessage.mockResolvedValue("0xmock_sig");
    mockUseWeb3.mockReturnValue({
      session: {
        topic: "test-topic",
        namespaces: {
          eip155: {
            chains: ["eip155:1"],
            accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
          },
        },
      },
      chainId: "eip155:1",
    });
    mockGetClient.mockReturnValue({ signMessage: mockSignMessage });
  });

  afterEach(() => {
    clearLocalStorage();
  });

  // ── Initial State ──────────────────────────────────────────────

  it("should have initial unauthenticated state", () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("should be restoring when autoRestore is true", () => {
    const { result } = renderHook(() => useSIWxSession());

    expect(result.current.isRestoring).toBe(true);
  });

  it("should finish restoring when no saved auth exists", async () => {
    const { result } = renderHook(() => useSIWxSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });

  // ── Persisted Session Restore ──────────────────────────────────

  it("should restore a valid persisted session", async () => {
    const session = createSiwxSession();
    setLocalStorage("naculus_siwx_session", session);

    const { result } = renderHook(() => useSIWxSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.session).not.toBeNull();
    expect(result.current.session!.signature).toBe("0xdeadbeef");
    expect(result.current.error).toBeNull();
  });

  it("should not restore when autoRestore is false", async () => {
    setLocalStorage("naculus_siwx_session", createSiwxSession());

    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it("should discard expired persisted session", async () => {
    const expired = createSiwxSession({
      message: {
        expirationTime: new Date(Date.now() - 10_000).toISOString(),
      },
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });
    setLocalStorage("naculus_siwx_session", expired);

    const { result } = renderHook(() => useSIWxSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();

    // Should be cleaned from storage
    expect(getLocalStorage("naculus_siwx_session")).toBeNull();
  });

  // ── Sign In ────────────────────────────────────────────────────

  it("should sign in and persist session", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    let session: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      session = await result.current.signIn({ statement: "Test sign-in" });
    });

    expect(session).toBeDefined();
    expect(session!.id).toMatch(/^siwx_/);
    expect(session!.chainId).toBe("eip155:1");
    expect(session!.signature).toBe("0xmock_sig");
    expect(result.current.isAuthenticated).toBe(true);

    // Verify persistence
    const stored = getLocalStorage("naculus_siwx_session");
    expect(stored).not.toBeNull();
    expect(stored.id).toBe(session!.id);
  });

  it("should handle sign-in failure", async () => {
    mockSignMessage.mockRejectedValue(new Error("User rejected"));

    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // Expected
      }
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBe("User rejected");

    // Should NOT persist anything
    expect(getLocalStorage("naculus_siwx_session")).toBeNull();
  });

  // ── Sign Out ───────────────────────────────────────────────────

  it("should clear session on sign-out", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
    expect(getLocalStorage("naculus_siwx_session")).toBeNull();
  });

  // ── Refresh ────────────────────────────────────────────────────

  it("should refresh an active session", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await act(async () => {
      await result.current.signIn({ statement: "Initial" });
    });

    const originalSession = result.current.session!;
    const originalId = originalSession.id;

    await act(async () => {
      const refreshed = await result.current.refresh();
      expect(refreshed.id).toBe(originalId);
      expect(refreshed.refreshedAt).not.toBeNull();
      expect(refreshed.signature).toBe("0xmock_sig");
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it("should throw on refresh when no session exists", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await expect(result.current.refresh()).rejects.toThrow("No active session to refresh");
  });

  // ── Expiry / Time ──────────────────────────────────────────────

  it("should report isExpired correctly", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    // No session → expired
    expect(result.current.isExpired).toBe(true);

    await act(async () => {
      await result.current.signIn();
    });

    // Active session → not expired
    expect(result.current.isExpired).toBe(false);
  });

  it("should report timeUntilExpiry correctly", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    // No session → null
    expect(result.current.timeUntilExpiry).toBeNull();

    await act(async () => {
      await result.current.signIn();
    });

    // Active session → positive number
    expect(result.current.timeUntilExpiry! > 0).toBe(true);
  });

  // ── Error Handling ─────────────────────────────────────────────

  it("should clear error via clearError", async () => {
    mockSignMessage.mockRejectedValue(new Error("Temporary error"));

    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

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

  // ── Sign-In After Sign-Out ─────────────────────────────────────

  it("should allow sign-in after sign-out", async () => {
    const { result } = renderHook(() => useSIWxSession({ autoRestore: false }));

    await act(async () => {
      await result.current.signIn({ statement: "First" });
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.signIn({ statement: "Second" });
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.session!.message.statement).toBe("Second");
  });
});
