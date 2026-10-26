/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  simulateERC20Transfer: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock("@naculus/wallet-engine", async () => {
  const actual = await vi.importActual<typeof import("@naculus/wallet-engine")>(
    "@naculus/wallet-engine",
  );
  return {
    ...actual,
    SimulationManager: class {
      constructor(config: unknown) {
        mocks.ctor(config);
      }
      simulateERC20Transfer = mocks.simulateERC20Transfer;
    },
  };
});

import { useSimulateTransfer } from "./useSimulateTransfer";

/**
 * ERC-20 transfer simulation, previously 0% covered.
 *
 * Two things are worth pinning. The chain must never be assumed — a preview
 * built against the wrong one describes a transfer that will not happen. And
 * the per-call RPC URL has to actually reach the engine: it was computed into
 * a local and then dropped, so a caller overriding the endpoint changed
 * nothing.
 */

const TOKEN = `0x${"11".repeat(20)}` as const;
const FROM = `0x${"22".repeat(20)}` as const;
const TO = `0x${"33".repeat(20)}` as const;
const outcome = { status: "success", summary: "ok" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.simulateERC20Transfer.mockResolvedValue(outcome);
});

describe("useSimulateTransfer", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useSimulateTransfer());
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("refuses to simulate without a chain rather than assuming one", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a" }),
    );
    await act(async () => {
      await expect(
        result.current.simulate(TOKEN, FROM, TO, "1"),
      ).rejects.toThrow(/No chain to simulate on/);
    });
    expect(mocks.simulateERC20Transfer).not.toHaveBeenCalled();
  });

  it("uses the hook-level chain", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 137 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1");
    });
    expect(mocks.simulateERC20Transfer.mock.calls[0][4]).toBe(137);
  });

  it("lets a per-call chain override the hook-level one", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1", {
        chainId: 8453,
        rpcUrl: "https://base",
      });
    });
    expect(mocks.simulateERC20Transfer.mock.calls[0][4]).toBe(8453);
  });

  it("rejects a chain override without that chain's RPC", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://mainnet", chainId: 1 }),
    );
    await act(async () => {
      await expect(
        result.current.simulate(TOKEN, FROM, TO, "1", { chainId: 8453 }),
      ).rejects.toThrow(/requires an RPC URL/);
    });
    expect(mocks.simulateERC20Transfer).not.toHaveBeenCalled();
  });

  it("forwards the hook-level RPC URL to the engine", async () => {
    // Previously computed into a local and never passed, so the engine used
    // whichever endpoint was baked in when the manager was first built.
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://hook", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1");
    });
    expect(mocks.simulateERC20Transfer.mock.calls[0][6]).toBe("https://hook");
  });

  it("lets a per-call RPC URL override the hook-level one", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://hook", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1", {
        rpcUrl: "https://percall",
      });
    });
    expect(mocks.simulateERC20Transfer.mock.calls[0][6]).toBe(
      "https://percall",
    );
  });

  it("passes decimals through when supplied", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1", { decimals: 6 });
    });
    expect(mocks.simulateERC20Transfer.mock.calls[0][5]).toBe(6);
  });

  it("exposes the result", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1");
    });
    expect(result.current.result).toEqual(outcome);
    expect(result.current.loading).toBe(false);
  });

  it("records a failure and leaves loading false", async () => {
    mocks.simulateERC20Transfer.mockRejectedValue(new Error("rpc down"));
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 1 }),
    );
    await act(async () => {
      await expect(
        result.current.simulate(TOKEN, FROM, TO, "1"),
      ).rejects.toThrow("rpc down");
    });
    expect(result.current.error?.message).toBe("rpc down");
    expect(result.current.loading).toBe(false);
  });

  it("resets", async () => {
    const { result } = renderHook(() =>
      useSimulateTransfer({ rpcUrl: "https://a", chainId: 1 }),
    );
    await act(async () => {
      await result.current.simulate(TOKEN, FROM, TO, "1");
    });
    act(() => result.current.reset());
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
