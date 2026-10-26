/// <reference types="vitest" />
/// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: unknown }) => children,
}));

import { useSession } from "./useSession";

/**
 * useSession is backed by useSyncExternalStore, which compares snapshots with
 * Object.is. getSessionSnapshot returned a fresh object literal on every call,
 * so the comparison never succeeded: React re-rendered, asked again, got
 * another new object, and threw "Maximum update depth exceeded". Every
 * component calling this exported hook crashed on first render — which is also
 * why the file had 0% coverage, since nothing had ever run it.
 */

function makeSessionManager(bundle: unknown) {
  const handlers = new Map<string, Set<() => void>>();
  return {
    getActiveBundle: () => bundle,
    on(event: string, h: () => void) {
      const s = handlers.get(event) ?? new Set();
      s.add(h);
      handlers.set(event, s);
    },
    off(event: string, h: () => void) {
      handlers.get(event)?.delete(h);
    },
    emit(event: string) {
      for (const h of handlers.get(event) ?? []) h();
    },
  };
}

const walletSession = {
  walletType: "eip6963",
  namespaces: { eip155: { chains: ["eip155:1"], accounts: [] } },
};

const bundle = (chainSessions: unknown[] = [], activeChainId = "eip155:1") => ({
  walletSession,
  chainSessions: new Map(chainSessions.map((c, i) => [String(i), c])),
  activeChainId,
});

beforeEach(() => vi.clearAllMocks());

describe("useSession", () => {
  it("renders without an infinite snapshot loop when disconnected", () => {
    mockUseWeb3.mockReturnValue({ sessionManager: null });
    expect(() => renderHook(() => useSession())).not.toThrow();
  });

  it("renders without an infinite snapshot loop when connected", () => {
    const sm = makeSessionManager(bundle([{ chainId: "eip155:1" }]));
    mockUseWeb3.mockReturnValue({ sessionManager: sm });
    expect(() => renderHook(() => useSession())).not.toThrow();
  });

  it("reports the disconnected shape with no session manager", () => {
    mockUseWeb3.mockReturnValue({ sessionManager: null });
    const { result } = renderHook(() => useSession());
    expect(result.current).toMatchObject({
      session: null,
      chainSessions: [],
      activeChainId: null,
      isConnected: false,
      connectorId: null,
    });
  });

  it("reports the connected shape from the active bundle", () => {
    const chain = { chainId: "eip155:1" };
    const sm = makeSessionManager(bundle([chain]));
    mockUseWeb3.mockReturnValue({ sessionManager: sm });
    const { result } = renderHook(() => useSession());
    expect(result.current.isConnected).toBe(true);
    expect(result.current.activeChainId).toBe("eip155:1");
    expect(result.current.connectorId).toBe("eip6963");
    expect(result.current.chainSessions).toEqual([chain]);
  });

  it("returns a stable reference across re-renders when nothing changed", () => {
    // This is the property useSyncExternalStore requires; without it the hook
    // cannot be used at all.
    const sm = makeSessionManager(bundle([{ chainId: "eip155:1" }]));
    mockUseWeb3.mockReturnValue({ sessionManager: sm });
    const { result, rerender } = renderHook(() => useSession());
    const first = result.current;
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it("produces a new snapshot when the active chain changes", () => {
    const chain = { chainId: "eip155:1" };
    const live = bundle([chain]);
    const sm = makeSessionManager(live);
    mockUseWeb3.mockReturnValue({ sessionManager: sm });
    const { result, rerender } = renderHook(() => useSession());
    const first = result.current;

    live.activeChainId = "eip155:137";
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.activeChainId).toBe("eip155:137");
  });

  it("produces a new snapshot when a chain session is added", () => {
    const live = bundle([{ chainId: "eip155:1" }]);
    const sm = makeSessionManager(live);
    mockUseWeb3.mockReturnValue({ sessionManager: sm });
    const { result, rerender } = renderHook(() => useSession());
    const first = result.current;

    live.chainSessions.set("1", { chainId: "eip155:137" });
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current.chainSessions).toHaveLength(2);
  });

  it("accepts an explicitly supplied session manager", () => {
    const sm = makeSessionManager(bundle([{ chainId: "eip155:1" }]));
    mockUseWeb3.mockReturnValue({ sessionManager: null });
    const { result } = renderHook(() => useSession(sm as never));
    expect(result.current.isConnected).toBe(true);
  });
});
