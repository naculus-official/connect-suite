/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: unknown }) => children,
}));

import {
  __resetSessionKeyManagerForTests,
  useCreateSessionKey,
  useRevokeSession,
  useSessionKeys,
} from "./useSessionKeys";

/**
 * Session keys carry spending authority, and the manager behind this hook is a
 * process-wide singleton built from whichever config arrived first. Every
 * later config was discarded in silence, so a component asking for a 0.1 ETH
 * cap could be operating under a cap someone else set. Refusing is the only
 * safe answer: the alternative is a limit the caller never agreed to.
 */

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  __resetSessionKeyManagerForTests();
  mockUseWeb3.mockReturnValue({ session: null });
});

const config = (over: Record<string, unknown> = {}) => ({
  defaultMaxTotalValue: BigInt("100000000000000000"),
  defaultMaxTxCount: 50,
  pbkdf2Iterations: 600_000,
  ...over,
});

describe("useSessionKeys configuration", () => {
  it("builds the manager from the first configuration", () => {
    expect(() =>
      renderHook(() => useSessionKeys(config() as never)),
    ).not.toThrow();
  });

  it("accepts a later identical configuration", () => {
    renderHook(() => useSessionKeys(config() as never));
    expect(() =>
      renderHook(() => useSessionKeys(config() as never)),
    ).not.toThrow();
  });

  it("accepts a later call that supplies no configuration", () => {
    // Omitting config means "whatever is already set up", which is a
    // different statement from asking for different limits.
    renderHook(() => useSessionKeys(config() as never));
    expect(() => renderHook(() => useSessionKeys())).not.toThrow();
  });

  it.each([
    [
      "a larger spend cap",
      { defaultMaxTotalValue: BigInt("1000000000000000000") },
    ],
    ["a different transaction count", { defaultMaxTxCount: 500 }],
    ["a weaker KDF", { pbkdf2Iterations: 10, unsafeAllowWeakKdf: true }],
    ["a different encryption key", { encryptionKey: "different-key" }],
    ["a different encryption salt", { encryptionSalt: "different-salt" }],
  ])("refuses %s supplied after the manager exists", (_label, over) => {
    renderHook(() => useSessionKeys(config() as never));
    expect(() =>
      renderHook(() => useSessionKeys(config(over) as never)),
    ).toThrow(/did not set|different spending configuration/);
  });

  it("names the singleton as the reason, so the fix is discoverable", () => {
    renderHook(() => useSessionKeys(config() as never));
    let message = "";
    try {
      renderHook(() =>
        useSessionKeys(config({ defaultMaxTxCount: 1 }) as never),
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/process-wide/);
    expect(message).toMatch(/construct a SessionKeyManager directly/);
  });
});

describe("useSessionKeys browser persistence", () => {
  it("restores a created key through a fresh manager", async () => {
    const persistentConfig = config({
      storagePrefix: "naculus-hook-persistence-test",
      encryptionKey: "browser-persistence-test-key",
      pbkdf2Iterations: 10,
      unsafeAllowWeakKdf: true,
      requireAllowedContracts: true,
    });
    mockUseWeb3.mockReturnValue({ session: { id: "embedded-test" } });

    const first = renderHook(() =>
      useCreateSessionKey(persistentConfig as never),
    );
    let createdId = "";
    await act(async () => {
      const created = await first.result.current.createSessionKey(
        {
          mode: "offchain",
          allowedContracts: ["0x1234567890123456789012345678901234567890"],
          allowedChainIds: [11155111],
          rails: ["transfer"],
        },
        "0x1234567890123456789012345678901234567890",
      );
      createdId = created.id;
    });
    expect(
      window.localStorage.getItem("naculus-hook-persistence-test:session_keys"),
    ).not.toBeNull();
    first.unmount();

    __resetSessionKeyManagerForTests();
    const restored = renderHook(() =>
      useSessionKeys(persistentConfig as never),
    );
    await waitFor(() =>
      expect(restored.result.current.sessions.map((item) => item.id)).toContain(
        createdId,
      ),
    );
  });
});

describe("useSessionKeys applies the caller's limits", () => {
  /**
   * Before this, every hook called getSessionKeyManager() with no argument,
   * so the manager was always built from library defaults and a consumer had
   * no way to set their own spending cap through the React API at all — the
   * limits governing delegated spending were whatever the library shipped.
   */
  it("passes the supplied configuration to the manager", () => {
    const { result } = renderHook(() =>
      useSessionKeys(config({ defaultMaxTxCount: 7 }) as never),
    );
    expect(result.current).toBeDefined();
    // A second call with the same config must not be rejected, which is only
    // possible if the first one was actually recorded.
    expect(() =>
      renderHook(() =>
        useSessionKeys(config({ defaultMaxTxCount: 7 }) as never),
      ),
    ).not.toThrow();
  });

  it("distinguishes a different cap from the recorded one", () => {
    renderHook(() => useSessionKeys(config({ defaultMaxTxCount: 7 }) as never));
    expect(() =>
      renderHook(() =>
        useSessionKeys(config({ defaultMaxTxCount: 8 }) as never),
      ),
    ).toThrow();
  });
});

describe("useSessionKeys re-grant after revoke", () => {
  // Re-grant is revoke-then-create: a revoked key is never reactivated, so the
  // replacement must carry a new id. Persistence is localStorage (not IndexedDB).
  const persistentConfig = config({
    storagePrefix: "naculus-hook-regrant-test",
    encryptionKey: "regrant-test-key",
    pbkdf2Iterations: 10,
    unsafeAllowWeakKdf: true,
    requireAllowedContracts: true,
  });
  const contract = "0x1234567890123456789012345678901234567890";
  const scope = {
    mode: "offchain",
    allowedContracts: [contract],
    allowedChainIds: [11155111],
    rails: ["transfer"],
  } as const;

  const useAll = () => ({
    keys: useSessionKeys(persistentConfig as never),
    create: useCreateSessionKey(persistentConfig as never),
    revoke: useRevokeSession(persistentConfig as never),
  });

  beforeEach(() => {
    mockUseWeb3.mockReturnValue({ session: { id: "embedded-test" } });
  });

  it("revokes a key, re-grants with a new id, and keeps the revoked one revoked", async () => {
    const { result, unmount } = renderHook(() => useAll());

    let id1 = "";
    await act(async () => {
      const info = await result.current.create.createSessionKey(
        scope as never,
        contract,
      );
      expect(info.status).toBe("active");
      id1 = info.id;
    });
    await act(async () => {
      await result.current.keys.refresh();
    });
    expect(result.current.keys.activeSessions.map((s) => s.id)).toContain(id1);
    expect(
      window.localStorage.getItem("naculus-hook-regrant-test:session_keys"),
    ).not.toBeNull();

    await act(async () => {
      await result.current.revoke.revokeSession(id1);
    });
    await act(async () => {
      await result.current.keys.refresh();
    });
    expect(
      result.current.keys.sessions.find((s) => s.id === id1)?.status,
    ).toBe("revoked");
    expect(result.current.keys.activeSessions.map((s) => s.id)).not.toContain(
      id1,
    );

    let id2 = "";
    await act(async () => {
      const info = await result.current.create.createSessionKey(
        scope as never,
        contract,
      );
      id2 = info.id;
    });
    await act(async () => {
      await result.current.keys.refresh();
    });
    expect(id2).not.toBe(id1);
    expect(result.current.keys.activeSessions.map((s) => s.id)).toEqual([id2]);
    expect(
      result.current.keys.sessions.find((s) => s.id === id1)?.status,
    ).toBe("revoked");

    unmount();
    __resetSessionKeyManagerForTests();
    const restored = renderHook(() => useAll());
    await waitFor(() => {
      const byId = new Map(restored.result.current.keys.sessions.map((s) => [s.id, s.status]));
      expect(byId.get(id1)).toBe("revoked");
      expect(byId.get(id2)).toBe("active");
    });
  });

  it("refuses to create a re-grant when the wallet session is gone", async () => {
    mockUseWeb3.mockReturnValue({ session: null });
    const { result } = renderHook(() => useAll());
    await expect(
      result.current.create.createSessionKey(scope as never, contract),
    ).rejects.toMatchObject({ code: "wallet_unavailable" });
  });
});
