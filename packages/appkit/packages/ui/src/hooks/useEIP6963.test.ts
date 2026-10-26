/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { useEIP6963 } from "./useEIP6963";

/**
 * EIP-6963 discovery is the entry point of every browser-extension
 * connection, and it had no coverage because this package carried no React
 * test setup at all. The behaviors worth pinning are the ones a user
 * notices: a wallet that announces twice must appear once, a malformed
 * announcement must not create a blank entry, and detection has to finish so
 * the UI can stop showing a spinner.
 */

function announce(info: Record<string, unknown>, provider: unknown = {}) {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info, provider },
    }),
  );
}

const metamask = {
  uuid: "u1",
  name: "MetaMask",
  icon: "data:image/svg+xml;base64,x",
  rdns: "io.metamask",
};

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "ethereum");
  Reflect.deleteProperty(window, "phantom");
  Reflect.deleteProperty(window, "solana");
});

describe("useEIP6963", () => {
  it("finds an injected MetaMask that never announces", () => {
    const provider = { isMetaMask: true };
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    const { result } = renderHook(() => useEIP6963());
    expect(result.current.wallets).toMatchObject([
      { id: "io.metamask", name: "MetaMask", provider },
    ]);
  });

  it("does not duplicate an injected wallet when effects run twice", () => {
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { isMetaMask: true },
    });
    const { result } = renderHook(() => useEIP6963(), { wrapper: StrictMode });
    expect(result.current.wallets).toHaveLength(1);
  });

  it("finds injected Phantom and deduplicates a later announcement", () => {
    const provider = { request: vi.fn() };
    Object.defineProperty(window, "phantom", { configurable: true, value: provider });
    const { result } = renderHook(() => useEIP6963());
    act(() => announce({ ...metamask, rdns: "app.phantom", name: "Phantom" }, provider));
    expect(result.current.wallets).toHaveLength(1);
    expect(result.current.wallets[0].provider).toBe(provider);
  });

  it("starts in the detecting state with no wallets", () => {
    const { result } = renderHook(() => useEIP6963());
    expect(result.current.isDetecting).toBe(true);
    expect(result.current.wallets).toEqual([]);
    expect(result.current.hasWallets).toBe(false);
  });

  it("collects an announced wallet", () => {
    const { result } = renderHook(() => useEIP6963());
    act(() => announce(metamask));
    expect(result.current.wallets).toHaveLength(1);
    expect(result.current.wallets[0]).toMatchObject({
      id: "io.metamask",
      name: "MetaMask",
      rdns: "io.metamask",
    });
    expect(result.current.hasWallets).toBe(true);
  });

  it("deduplicates a wallet that announces more than once", () => {
    // Extensions re-announce on every requestProvider; showing MetaMask three
    // times in the picker is the visible symptom.
    const { result } = renderHook(() => useEIP6963());
    act(() => {
      announce(metamask);
      announce(metamask);
      announce(metamask);
    });
    expect(result.current.wallets).toHaveLength(1);
  });

  it("keeps distinct wallets apart", () => {
    const { result } = renderHook(() => useEIP6963());
    act(() => {
      announce(metamask);
      announce({ ...metamask, rdns: "app.phantom", name: "Phantom" });
    });
    expect(result.current.wallets.map((w) => w.rdns)).toEqual([
      "io.metamask",
      "app.phantom",
    ]);
  });

  it("ignores an announcement with no rdns", () => {
    // rdns is the identity; without it there is nothing to dedupe on and the
    // entry cannot be matched back to a provider.
    const { result } = renderHook(() => useEIP6963());
    act(() => announce({ name: "Nameless" }));
    expect(result.current.wallets).toEqual([]);
  });

  it("falls back to the rdns when the wallet announces no name", () => {
    const { result } = renderHook(() => useEIP6963());
    act(() => announce({ rdns: "io.anon" }));
    expect(result.current.wallets[0].name).toBe("io.anon");
  });

  it("carries the provider through for later connection", () => {
    const provider = { request: () => {} };
    const { result } = renderHook(() => useEIP6963());
    act(() => announce(metamask, provider));
    expect(result.current.wallets[0].provider).toBe(provider);
  });

  it("stops detecting so the UI can leave its loading state", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEIP6963());
    expect(result.current.isDetecting).toBe(true);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.isDetecting).toBe(false);
  });

  it("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useEIP6963());
    unmount();
    act(() => announce(metamask));
    expect(result.current.wallets).toEqual([]);
  });
});
