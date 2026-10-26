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

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const _mockSignMessage = vi.fn();
const mockGetClient = vi.fn();
vi.mock("../client", () => ({
  getClient: () => mockGetClient(),
}));

// We need to mock useSignInWithX since useSiwxAuthSession composes it
const mockUseSignInWithX = vi.fn();
vi.mock("./useSignInWithX", () => ({
  useSignInWithX: () => mockUseSignInWithX(),
}));

import { useSiwxAuthSession } from "./useSiwxAuthSession";

// ── Test Fixtures ────────────────────────────────────────────────

function createSiwxResult(overrides: Record<string, unknown> = {}) {
  const defaultExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
  return {
    message: {
      raw: "localhost wants you to sign in",
      domain: "localhost",
      address: "eip155:1:0x1234567890123456789012345678901234567890",
      statement: "Sign in to test",
      uri: "http://localhost",
      version: 1,
      chainId: "eip155:1",
      nonce: "abc123xyz",
      issuedAt: new Date().toISOString(),
      expirationTime: defaultExpiry,
      notBefore: null,
      resources: [],
      requestId: null,
      ...(overrides.message ?? {}),
    },
    signature: "0xdeadbeef",
    ...overrides,
  };
}

// ── Storage Helpers ──────────────────────────────────────────────

function setLocalStorage(key: string, value: unknown) {
  localStorage.setItem(`naculus_${key}`, JSON.stringify(value));
}

function getLocalStorage(key: string) {
  const v = localStorage.getItem(`naculus_${key}`);
  return v ? JSON.parse(v) : null;
}

function clearLocalStorage() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith("naculus_"));
  keys.forEach((k) => localStorage.removeItem(k));
}

// ── Tests ───────────────────────────────────────────────────────

describe("useSiwxAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLocalStorage();

    // Default mock for useSignInWithX
    mockUseSignInWithX.mockReturnValue({
      signIn: vi.fn(),
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    // Default mock for Web3 context
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
  });

  afterEach(() => {
    clearLocalStorage();
  });

  // ── Initial State ──────────────────────────────────────────────

  it("should have initial unsigned state", () => {
    const { result } = renderHook(() => useSiwxAuthSession());

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();
    expect(result.current.isSigningIn).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isRestoring).toBe(true); // still restoring
  });

  it("should finish restoring when no saved auth exists", async () => {
    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();
  });

  // ── Persisted Auth Restore ─────────────────────────────────────

  it("should restore a valid persisted auth session", async () => {
    const siwxResult = createSiwxResult();
    setLocalStorage("siwx_auth", siwxResult);

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.siwxResult).not.toBeNull();
    expect(result.current.siwxResult!.signature).toBe("0xdeadbeef");
    expect(result.current.error).toBeNull();
  });

  it("should auto-restore off when autoRestore=false", async () => {
    setLocalStorage("siwx_auth", createSiwxResult());

    const { result } = renderHook(() => useSiwxAuthSession({ autoRestore: false }));

    // Auto-restore set to false, so isRestoring should quickly be false
    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    // Should not have restored the auth
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();
  });

  it("should discard expired persisted auth", async () => {
    const expired = createSiwxResult({
      message: {
        expirationTime: new Date(Date.now() - 10000).toISOString(), // 10s ago
      },
    });
    setLocalStorage("siwx_auth", expired);

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();

    // Verify it was cleaned from storage
    expect(getLocalStorage("siwx_auth")).toBeNull();
  });

  it("should discard notBefore-violated persisted auth", async () => {
    const futureNotBefore = createSiwxResult({
      message: {
        notBefore: new Date(Date.now() + 3600000).toISOString(), // 1h in future
        expirationTime: new Date(Date.now() + 7200000).toISOString(),
      },
    });
    setLocalStorage("siwx_auth", futureNotBefore);

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();
    expect(getLocalStorage("siwx_auth")).toBeNull();
  });

  it("should restore auth without expirationTime", async () => {
    const noExpiry = createSiwxResult({
      message: { expirationTime: null },
    });
    setLocalStorage("siwx_auth", noExpiry);

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.isSignedIn).toBe(true);
  });

  // ── Sign In ────────────────────────────────────────────────────

  it("should persist SIWx result on successful sign-in", async () => {
    const mockResult = createSiwxResult({ signature: "0xpersisted_sig" });
    const mockSignIn = vi.fn().mockResolvedValue(mockResult);
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() => useSiwxAuthSession());

    // Wait for restore check to complete
    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    let returned: Awaited<ReturnType<typeof result.current.signIn>> | undefined;

    await act(async () => {
      returned = await result.current.signIn({
        statement: "Test sign-in",
      });
    });

    expect(returned!.signature).toBe("0xpersisted_sig");
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.siwxResult!.signature).toBe("0xpersisted_sig");

    // Verify it was persisted to storage
    const stored = getLocalStorage("siwx_auth");
    expect(stored).not.toBeNull();
    expect(stored.signature).toBe("0xpersisted_sig");
  });

  it("should handle sign-in failure without persisting", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("User rejected"));
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // expected
      }
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toBe("User rejected");

    // Should NOT have persisted anything
    expect(getLocalStorage("siwx_auth")).toBeNull();
  });

  // ── Sign Out ───────────────────────────────────────────────────

  it("should clear persisted auth on sign-out", async () => {
    const mockResult = createSiwxResult({ signature: "0xwill_clear" });
    const mockSignIn = vi.fn().mockResolvedValue(mockResult);
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() => useSiwxAuthSession());

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    // Sign in first
    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.isSignedIn).toBe(true);
    expect(getLocalStorage("siwx_auth")).not.toBeNull();

    // Sign out
    await act(async () => {
      result.current.signOut();
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.siwxResult).toBeNull();
    expect(getLocalStorage("siwx_auth")).toBeNull();
  });

  // ── Edge Cases ─────────────────────────────────────────────────

  it("should use custom storage prefix", async () => {
    const mockResult = createSiwxResult({ signature: "0xprefix_test" });
    const mockSignIn = vi.fn().mockResolvedValue(mockResult);
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() =>
      useSiwxAuthSession({ storagePrefix: "myapp_", autoRestore: false })
    );

    await act(async () => {
      await result.current.signIn();
    });

    // Should use custom prefix
    expect(localStorage.getItem("myapp_siwx_auth")).not.toBeNull();
  });

  it("should allow sign-in after sign-out", async () => {
    const mockResult1 = createSiwxResult({ signature: "0xfirst" });
    const mockResult2 = createSiwxResult({ signature: "0xsecond" });
    const mockSignIn = vi.fn()
      .mockResolvedValueOnce(mockResult1)
      .mockResolvedValueOnce(mockResult2);
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() => useSiwxAuthSession({ autoRestore: false }));

    // Sign in first time
    await act(async () => {
      await result.current.signIn({ statement: "First" });
    });
    expect(result.current.siwxResult!.signature).toBe("0xfirst");

    // Sign out
    await act(async () => {
      result.current.signOut();
    });
    expect(result.current.isSignedIn).toBe(false);

    // Sign in again
    await act(async () => {
      await result.current.signIn({ statement: "Second" });
    });
    expect(result.current.siwxResult!.signature).toBe("0xsecond");
  });

  it("should restore auth with custom prefix", async () => {
    const siwxResult = createSiwxResult();
    localStorage.setItem("custom_siwx_auth", JSON.stringify(siwxResult));

    const { result } = renderHook(() =>
      useSiwxAuthSession({ storagePrefix: "custom_" })
    );

    await waitFor(() => {
      expect(result.current.isSignedIn).toBe(true);
    });
  });

  it("should clear error via clearError", async () => {
    const mockSignIn = vi.fn().mockRejectedValue(new Error("Something went wrong"));
    mockUseSignInWithX.mockReturnValue({
      signIn: mockSignIn,
      isSigningIn: false,
      result: null,
      error: null,
      clearError: vi.fn(),
    });

    const { result } = renderHook(() => useSiwxAuthSession({ autoRestore: false }));

    await act(async () => {
      try {
        await result.current.signIn();
      } catch {
        // expected
      }
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
