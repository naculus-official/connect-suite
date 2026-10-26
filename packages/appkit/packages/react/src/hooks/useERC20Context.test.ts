/// <reference types="vitest" />
/// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useERC20Context } from "./useERC20Context";

/**
 * The context guard is only useful if it changes when the context changes and
 * — the part that was broken — stays put when it does not.
 *
 * It used to key on object references. `publicClient` is memoized on
 * `currentChain`, which is memoized on `config.chains`, so a consumer writing
 * `config={{ chains: [...] }}` inline produced a fresh identity every render.
 * Work that was still perfectly current reported itself stale, and the
 * callbacks keyed on the identity re-fired the effects that depend on them.
 */

const token = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const,
  chainId: 1,
  decimals: 6,
};
const OWNER = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const base = {
  token,
  chainId: 1,
  owner: OWNER,
  spender: SPENDER,
  connected: true,
  publicClient: { id: "pc" },
};

describe("useERC20Context — identity stability", () => {
  it("survives a publicClient rebuilt for the same chain", () => {
    // The common case: a consumer passes an inline config object, so every
    // render produces a new client for an unchanged chain.
    const { result, rerender } = renderHook(
      (props: { publicClient: unknown }) =>
        useERC20Context({ ...base, publicClient: props.publicClient }),
      { initialProps: { publicClient: { id: "pc" } } },
    );
    const first = result.current.identity;

    rerender({ publicClient: { id: "different-object-same-chain" } });

    expect(result.current.identity).toBe(first);
    expect(result.current.isCurrent()).toBe(true);
  });

  it("survives a token object rebuilt with the same values", () => {
    const { result, rerender } = renderHook(
      (props: { token: typeof token }) =>
        useERC20Context({ ...base, token: props.token }),
      { initialProps: { token } },
    );
    const first = result.current.identity;

    rerender({ token: { ...token } });

    expect(result.current.identity).toBe(first);
  });

  it("survives a session wrapper rebuilt around the same session", () => {
    const { result, rerender } = renderHook(
      (props: { session: unknown }) =>
        useERC20Context({ ...base, session: props.session }),
      { initialProps: { session: { id: "s1", extra: 1 } } },
    );
    const first = result.current.identity;

    rerender({ session: { id: "s1", extra: 2 } });

    expect(result.current.identity).toBe(first);
  });

  it("ignores which client facade routes the call", () => {
    const { result, rerender } = renderHook(
      (props: { client: unknown }) =>
        useERC20Context({ ...base, client: props.client }),
      { initialProps: { client: { a: 1 } as unknown } },
    );
    const first = result.current.identity;
    rerender({ client: { b: 2 } });
    expect(result.current.identity).toBe(first);
  });
});

describe("useERC20Context — identity changes", () => {
  it.each([
    ["the connected chain", { chainId: 137 }],
    ["the owner", { owner: SPENDER }],
    ["the spender", { spender: OWNER }],
    [
      "the token",
      { token: { ...token, address: `0x${"33".repeat(20)}` as const } },
    ],
    ["the token's chain", { token: { ...token, chainId: 137 } }],
    ["the token's decimals", { token: { ...token, decimals: 18 } }],
    ["connectedness", { connected: false }],
    ["the session", { session: { id: "s2" } }],
  ])("changes when %s changes", (_label, override) => {
    const { result, rerender } = renderHook(
      (props: Record<string, unknown>) =>
        useERC20Context({ ...base, session: { id: "s1" }, ...props } as never),
      { initialProps: {} as Record<string, unknown> },
    );
    const first = result.current.identity;

    rerender(override as Record<string, unknown>);

    expect(result.current.identity).not.toBe(first);
  });

  it("notices the public client disappearing", () => {
    // Presence is what matters, not which object: no client means no reads.
    const { result, rerender } = renderHook(
      (props: { publicClient: unknown }) =>
        useERC20Context({ ...base, publicClient: props.publicClient }),
      { initialProps: { publicClient: { id: "pc" } as unknown } },
    );
    const first = result.current.identity;
    rerender({ publicClient: null });
    expect(result.current.identity).not.toBe(first);
  });

  it("treats an address that differs only in case as the same token", () => {
    const { result, rerender } = renderHook(
      (props: { token: typeof token }) =>
        useERC20Context({ ...base, token: props.token }),
      { initialProps: { token } },
    );
    const first = result.current.identity;
    rerender({
      token: {
        ...token,
        address: token.address.toLowerCase() as typeof token.address,
      },
    });
    expect(result.current.identity).toBe(first);
  });
});

describe("useERC20Context — assertCurrent", () => {
  it("passes for a token on the active chain", () => {
    const { result } = renderHook(() => useERC20Context(base));
    expect(() => result.current.assertCurrent()).not.toThrow();
  });

  it("refuses a token configured for another chain", () => {
    const { result } = renderHook(() =>
      useERC20Context({ ...base, chainId: 137 }),
    );
    expect(() => result.current.assertCurrent()).toThrow(/chain 1/);
  });

  it("refuses once the context has moved on", () => {
    const { result, rerender } = renderHook(
      (props: { owner: string }) =>
        useERC20Context({ ...base, owner: props.owner }),
      { initialProps: { owner: OWNER } },
    );
    const stale = result.current.assertCurrent;

    rerender({ owner: SPENDER });

    // Captured before the change, so it must refuse rather than sign for an
    // account the user has since switched away from.
    expect(() => stale()).toThrow(/context changed/);
    expect(() => result.current.assertCurrent()).not.toThrow();
  });

  it("refuses after unmount", () => {
    const { result, unmount } = renderHook(() => useERC20Context(base));
    const captured = result.current.assertCurrent;
    unmount();
    expect(() => captured()).toThrow(/context changed/);
  });

  it("reports a stale context, not an unavailable wallet", () => {
    // The wallet is fine; the caller's assumptions are not. Reporting
    // wallet_unavailable sent consumers looking at the wrong thing.
    const { result, rerender } = renderHook(
      (props: { owner: string }) =>
        useERC20Context({ ...base, owner: props.owner }),
      { initialProps: { owner: OWNER } },
    );
    const stale = result.current.assertCurrent;
    rerender({ owner: SPENDER });
    try {
      stale();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("session_inactive");
    }
  });
});
