/// <reference types="vitest" />
/// @vitest-environment jsdom

import { WalletError } from "@naculus/connect-core";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));

import { useSwitchChain } from "./useSwitchChain";

/**
 * Chain switching, previously 0% covered.
 *
 * The distinction these tests protect: a user pressing Cancel and a wallet
 * that has never heard of the chain are different outcomes. One is worth
 * offering to retry; the other needs the chain added first. Both used to
 * arrive as `chain_unsupported`.
 */

const setup = (switchChain: () => Promise<void>, chainId = "eip155:1") => {
  mockUseWeb3.mockReturnValue({ switchChain, chainId });
};

beforeEach(() => vi.clearAllMocks());

describe("useSwitchChain", () => {
  it("reports the active chain", () => {
    setup(vi.fn(), "eip155:137");
    const { result } = renderHook(() => useSwitchChain());
    expect(result.current.currentChainId).toBe("eip155:137");
    expect(result.current.isSwitching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("forwards the requested chain to the provider", async () => {
    const switchChain = vi.fn().mockResolvedValue(undefined);
    setup(switchChain);
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await result.current.switchChain("eip155:8453");
    });
    expect(switchChain).toHaveBeenCalledWith("eip155:8453");
    expect(result.current.error).toBeNull();
  });

  it("leaves isSwitching false after a failure, not stuck true", async () => {
    // A UI that never clears this shows a spinner forever.
    setup(vi.fn().mockRejectedValue(new Error("boom")));
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:1")).rejects.toThrow();
    });
    expect(result.current.isSwitching).toBe(false);
  });

  it("reports a user rejection as a rejection, not an unsupported chain", async () => {
    setup(
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("User rejected the request"), { code: 4001 }),
        ),
    );
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:137")).rejects.toThrow();
    });
    expect((result.current.error as WalletError).code).toBe(
      "chain_switch_rejected",
    );
  });

  it("reports an unrecognized chain as unsupported and says why", async () => {
    setup(
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Unrecognized chain ID"), { code: 4902 }),
        ),
    );
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:999")).rejects.toThrow();
    });
    const error = result.current.error as WalletError;
    expect(error.code).toBe("chain_unsupported");
    expect(error.message).toMatch(/does not have this chain configured/);
  });

  it("passes a WalletError through unchanged", async () => {
    const original = new WalletError("session_expired", "gone");
    setup(vi.fn().mockRejectedValue(original));
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:1")).rejects.toBe(
        original,
      );
    });
    expect(result.current.error).toBe(original);
  });

  it("clears the error", async () => {
    setup(vi.fn().mockRejectedValue(new Error("boom")));
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:1")).rejects.toThrow();
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it("clears a previous error when a later switch succeeds", async () => {
    const switchChain = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    setup(switchChain);
    const { result } = renderHook(() => useSwitchChain());
    await act(async () => {
      await expect(result.current.switchChain("eip155:1")).rejects.toThrow();
    });
    await act(async () => {
      await result.current.switchChain("eip155:137");
    });
    expect(result.current.error).toBeNull();
  });
});
