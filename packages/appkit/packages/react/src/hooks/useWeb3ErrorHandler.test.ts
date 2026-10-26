/// <reference types="vitest" />
/// @vitest-environment jsdom

import { WalletError } from "@naculus/connect-core";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));

import { useWeb3ErrorHandler } from "./useWeb3ErrorHandler";

/**
 * Error presentation, previously 0% covered while being a public export.
 *
 * The property that matters most is what `wrapAsync` does to an error on its
 * way out. It used to construct a fresh Error from the friendly description,
 * which threw away the wallet's own message, any `details`, and the class —
 * so a caller's `err instanceof WalletError` stopped matching the moment they
 * adopted the wrapper meant to help them.
 */

const setup = (error: unknown = null) => {
  const clearError = vi.fn();
  mockUseWeb3.mockReturnValue({ error, clearError });
  return { clearError };
};

beforeEach(() => vi.clearAllMocks());

describe("useWeb3ErrorHandler — presentation", () => {
  it("reports nothing when there is no error", () => {
    setup(null);
    const { result } = renderHook(() => useWeb3ErrorHandler());
    expect(result.current.friendlyError).toBeNull();
    expect(result.current.isRetryable).toBe(false);
  });

  it("titles a WalletError from its code", () => {
    setup(new WalletError("user_rejected", "User rejected the request"));
    const { result } = renderHook(() => useWeb3ErrorHandler());
    expect(result.current.friendlyError?.code).toBe("user_rejected");
    expect(result.current.friendlyError?.title).toBeTruthy();
  });

  it("formats an arbitrary error on demand", () => {
    setup(null);
    const { result } = renderHook(() => useWeb3ErrorHandler());
    const formatted = result.current.formatError(new Error("user rejected"));
    expect(formatted.code).toBe("user_rejected");
  });

  it("delegates clearError to the provider", () => {
    const { clearError } = setup(new Error("boom"));
    const { result } = renderHook(() => useWeb3ErrorHandler());
    act(() => result.current.clearError());
    expect(clearError).toHaveBeenCalled();
  });
});

describe("useWeb3ErrorHandler — wrapAsync", () => {
  const wrap = <T>(fn: () => Promise<T>) => {
    setup(null);
    const { result } = renderHook(() => useWeb3ErrorHandler());
    return result.current.wrapAsync(fn);
  };

  it("passes a successful result through", async () => {
    await expect(wrap(async () => 42)()).resolves.toBe(42);
  });

  it("keeps the error class so instanceof still works", async () => {
    // The regression that made the wrapper unusable: replacing the error meant
    // callers could no longer branch on the SDK's own type.
    const original = new WalletError("session_expired", "session gone");
    let caught: unknown;
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WalletError);
    expect(caught).toBe(original);
  });

  it("keeps the technical message rather than replacing it", async () => {
    // The friendly sentence is for the UI; the wallet's own words are the
    // only diagnostic evidence of what failed.
    // user_rejected has a canned description, so the two genuinely differ.
    // A code with no canned text falls back to the technical message, which
    // is better than a generic "something went wrong".
    const original = new WalletError(
      "user_rejected",
      "eth_call reverted: 0x1234",
    );
    let caught!: Error & { friendlyMessage?: string };
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught.message).toBe("eth_call reverted: 0x1234");
    expect(caught.friendlyMessage).toBeTruthy();
    expect(caught.friendlyMessage).not.toBe(caught.message);
  });

  it("keeps structured details", async () => {
    const details = { revert: "0xdeadbeef" };
    const original = new WalletError("tx_failed", "reverted", details);
    let caught!: WalletError;
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err as WalletError;
    }
    expect(caught.details).toBe(details);
  });

  it("attaches a title for the UI", async () => {
    let caught!: Error & { title?: string };
    try {
      await wrap(async () => {
        throw new WalletError("user_rejected", "declined");
      })();
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught.title).toBeTruthy();
  });

  it("does not overwrite a code the error already carries", async () => {
    // getUserFriendlyError infers a code from message text for plain errors.
    // Letting that guess replace a wallet's own code would hide the real
    // reason behind a regex match.
    const original = new WalletError("session_expired", "user rejected it");
    let caught!: WalletError;
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err as WalletError;
    }
    expect(caught.code).toBe("session_expired");
  });

  it("fills in a code when the error has none", async () => {
    let caught!: Error & { code?: string };
    try {
      await wrap(async () => {
        throw new Error("user rejected the request");
      })();
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught.code).toBe("user_rejected");
  });

  it("keeps the original stack", async () => {
    const original = new Error("deep failure");
    const stack = original.stack;
    let caught!: Error;
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err as Error;
    }
    expect(caught.stack).toBe(stack);
  });

  it("survives a frozen error rather than throwing from the handler", async () => {
    const original = Object.freeze(new WalletError("rpc_error", "frozen"));
    let caught: unknown;
    try {
      await wrap(async () => {
        throw original;
      })();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(original);
  });

  it("reaches a non-Error rejection through cause", async () => {
    // Nothing to preserve the identity of, so the original value stays
    // available rather than being dropped.
    let caught!: Error & { cause?: unknown };
    try {
      await wrap(async () => {
        throw { weird: true };
      })();
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.cause).toEqual({ weird: true });
  });
});
