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
