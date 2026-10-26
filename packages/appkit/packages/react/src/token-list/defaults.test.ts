/// <reference types="vitest" />

import { describe, expect, it } from "vitest";
import { getDefaultSources } from "./defaults";

/**
 * These sources decide which tokens a user can pick without configuring
 * anything, so the properties worth holding are that the built-in list is
 * usable offline and that its entries are well-formed — a malformed address
 * or a wrong decimals value here becomes a wrong amount at send time.
 */

describe("getDefaultSources", () => {
  const sources = getDefaultSources();

  it("provides a built-in source that works without network access", () => {
    const builtIn = sources.find((s) => s.name === "built-in");
    expect(builtIn).toBeDefined();
    expect(builtIn?.url).toBeUndefined();
    expect(builtIn?.tokens?.length ?? 0).toBeGreaterThan(0);
  });

  it("provides a remote source with a refresh interval", () => {
    const remote = sources.find((s) => s.url);
    expect(remote?.url).toMatch(/^https:\/\//);
    expect(remote?.refreshInterval).toBeGreaterThan(0);
  });

  it("enables every default source", () => {
    expect(sources.every((s) => s.enabled)).toBe(true);
  });

  it("returns a fresh array so a caller cannot mutate the defaults", () => {
    const a = getDefaultSources();
    const b = getDefaultSources();
    expect(a).not.toBe(b);
    a.pop();
    expect(getDefaultSources()).toHaveLength(b.length);
  });

  it("carries well-formed built-in token entries", () => {
    const tokens = getDefaultSources().find((s) => s.name === "built-in")
      ?.tokens ?? [];
    for (const t of tokens) {
      expect(t.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(Number.isInteger(t.decimals)).toBe(true);
      expect(t.decimals).toBeGreaterThanOrEqual(0);
      expect(t.decimals).toBeLessThanOrEqual(36);
      expect(t.symbol.length).toBeGreaterThan(0);
      expect(Number.isInteger(t.chainId)).toBe(true);
    }
  });

  it("has no duplicate address on the same chain", () => {
    const tokens = getDefaultSources().find((s) => s.name === "built-in")
      ?.tokens ?? [];
    const keys = tokens.map((t) => `${t.chainId}:${t.address.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
