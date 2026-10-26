/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mockUseWeb3 = vi.fn();
vi.mock("@naculus/connect-appkit-react", () => ({
  useWeb3: () => mockUseWeb3(),
}));

import {
  WalletConnectProvider,
  useWalletConnect,
  useWalletConnectOptional,
} from "./WalletConnectContext";

/**
 * The QR pairing state machine, previously 1.96% covered with 0% branches.
 *
 * startPairing/completePairing cannot be aborted, so cancelling only stopped
 * the QR from being displayed: the awaited completePairing kept running and
 * its success path then overwrote the cancelled state. A user who pressed
 * cancel and whose wallet approved a moment later ended up connected with the
 * UI back at idle, as if they had never declined.
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <WalletConnectProvider>{children}</WalletConnectProvider>
);

/** A pairing whose completion we control. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe("WalletConnectProvider", () => {
  it("starts idle", () => {
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(),
      completePairing: vi.fn(),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    expect(result.current.state).toMatchObject({
      qrUri: null,
      showQR: false,
      qrStatus: "idle",
      error: null,
    });
  });

  it("reports an error when the provider cannot pair at all", async () => {
    mockUseWeb3.mockReturnValue({});
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    await act(async () => {
      await result.current.connectWalletConnect();
    });
    expect(result.current.state.qrStatus).toBe("error");
    expect(result.current.state.error).toMatch(/not available/);
  });

  it("exposes the URI once pairing starts", async () => {
    const completion = deferred<void>();
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2?relay=irn"),
      completePairing: vi.fn(() => completion.promise),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    act(() => {
      void result.current.connectWalletConnect();
    });
    await waitFor(() => expect(result.current.state.qrStatus).toBe("ready"));
    expect(result.current.state.qrUri).toMatch(/^wc:/);
    expect(result.current.state.showQR).toBe(true);
  });

  it("surfaces a failure to generate the URI", async () => {
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => {
        throw new Error("relay unreachable");
      }),
      completePairing: vi.fn(),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    await act(async () => {
      await result.current.connectWalletConnect();
    });
    expect(result.current.state.qrStatus).toBe("error");
    expect(result.current.state.error).toMatch(/relay unreachable/);
  });

  it("surfaces a rejection from the wallet", async () => {
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(async () => {
        throw new Error("User rejected");
      }),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    await act(async () => {
      await result.current.connectWalletConnect();
    });
    expect(result.current.state.qrStatus).toBe("error");
    expect(result.current.state.error).toMatch(/User rejected/);
  });
});

describe("cancelling a pairing", () => {
  it("marks the attempt cancelled", async () => {
    const completion = deferred<void>();
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(() => completion.promise),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    act(() => {
      void result.current.connectWalletConnect();
    });
    await waitFor(() => expect(result.current.state.qrStatus).toBe("ready"));

    act(() => result.current.cancelQR());
    expect(result.current.state.qrStatus).toBe("cancelled");
    expect(result.current.state.showQR).toBe(false);
    expect(result.current.state.qrUri).toBeNull();
  });

  it("a late approval does not resurrect a cancelled attempt", async () => {
    // The user declined. Whatever the wallet does afterwards must not put the
    // UI back to idle as though the decline never happened.
    const completion = deferred<void>();
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(() => completion.promise),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    act(() => {
      void result.current.connectWalletConnect();
    });
    await waitFor(() => expect(result.current.state.qrStatus).toBe("ready"));

    act(() => result.current.cancelQR());
    await act(async () => {
      completion.resolve();
      await Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 1100));
    expect(result.current.state.qrStatus).toBe("cancelled");
    expect(result.current.state.showQR).toBe(false);
  });

  it("a late failure does not overwrite the cancelled state", async () => {
    const completion = deferred<void>();
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(() => completion.promise),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    act(() => {
      void result.current.connectWalletConnect();
    });
    await waitFor(() => expect(result.current.state.qrStatus).toBe("ready"));

    act(() => result.current.cancelQR());
    await act(async () => {
      completion.reject(new Error("too late"));
      await Promise.resolve();
    });
    expect(result.current.state.qrStatus).toBe("cancelled");
    expect(result.current.state.error).toBeNull();
  });
});

describe("hook access", () => {
  it("throws outside a provider", () => {
    expect(() => renderHook(() => useWalletConnect())).toThrow(
      /must be used within/,
    );
  });

  it("the optional variant returns null outside a provider", () => {
    const { result } = renderHook(() => useWalletConnectOptional());
    expect(result.current).toBeNull();
  });
});

describe("cancel reaches the connector", () => {
  it("asks the connector to abandon the pairing, not just hide the QR", async () => {
    // Hiding the QR leaves the pairing running; the wallet can still approve
    // and the user ends up connected to something they declined.
    const cancelPairing = vi.fn();
    const completion = deferred<void>();
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(() => completion.promise),
      cancelPairing,
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    act(() => {
      void result.current.connectWalletConnect();
    });
    await waitFor(() => expect(result.current.state.qrStatus).toBe("ready"));

    act(() => result.current.cancelQR());
    expect(cancelPairing).toHaveBeenCalledTimes(1);
  });

  it("still cancels cleanly when the provider offers no cancelPairing", () => {
    mockUseWeb3.mockReturnValue({
      startPairing: vi.fn(async () => "wc:abc@2"),
      completePairing: vi.fn(),
    });
    const { result } = renderHook(() => useWalletConnect(), { wrapper });
    expect(() => act(() => result.current.cancelQR())).not.toThrow();
    expect(result.current.state.qrStatus).toBe("cancelled");
  });
});
