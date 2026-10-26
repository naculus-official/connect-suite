import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDecimalsCache,
  readDecimals,
  tokenKey,
  writeDecimals,
} from "./token-decimals";

/**
 * The ERC-20 hooks cached decimals in a bare useRef seeded from the token
 * prop. useRef only takes its initial value on mount and nothing reset it, so
 * a component with a token selector kept the first token's precision:
 * choosing USDC (6) and then DAI (18) converted "100" with 6 decimals and
 * transferred 0.0000000001 DAI. The transfer succeeded, so nothing surfaced
 * the mistake — the user simply sent dust believing they had sent 100.
 */

const USDC = { chainId: 1, address: `0x${"aa".repeat(20)}` };
const DAI = { chainId: 1, address: `0x${"bb".repeat(20)}` };
const USDC_ON_POLYGON = { chainId: 137, address: USDC.address };

describe("core boundary", () => {
  it("does not import a UI framework", () => {
    const source = readFileSync(join(__dirname, "token-decimals.ts"), "utf8");
    for (const f of ["react", "vue", "svelte", "solid-js"]) {
      expect(source).not.toMatch(new RegExp(`from ["']${f}(/|["'])`));
    }
  });
});

describe("tokenKey", () => {
  it("separates the same address on different chains", () => {
    expect(tokenKey(USDC)).not.toBe(tokenKey(USDC_ON_POLYGON));
  });

  it("is case-insensitive on the address", () => {
    expect(tokenKey({ chainId: 1, address: USDC.address.toUpperCase() })).toBe(
      tokenKey(USDC),
    );
  });
});

describe("decimals cache", () => {
  it("returns the seeded value for the token it was created for", () => {
    const cache = createDecimalsCache(USDC, 6);
    expect(readDecimals(cache, USDC, 6)).toBe(6);
  });

  it("does not return one token's decimals for another", () => {
    // The whole defect in one assertion.
    const cache = createDecimalsCache(USDC, 6);
    expect(readDecimals(cache, DAI, undefined)).toBeUndefined();
  });

  it("does not carry decimals across chains for the same address", () => {
    const cache = createDecimalsCache(USDC, 6);
    expect(readDecimals(cache, USDC_ON_POLYGON, undefined)).toBeUndefined();
  });

  it("adopts the new token's known decimals when switching", () => {
    const cache = createDecimalsCache(USDC, 6);
    expect(readDecimals(cache, DAI, 18)).toBe(18);
  });

  it("keeps a value written for the current token", () => {
    const cache = createDecimalsCache(USDC, undefined);
    writeDecimals(cache, USDC, 6);
    expect(readDecimals(cache, USDC, undefined)).toBe(6);
  });

  it("discards a value once the token changes", () => {
    const cache = createDecimalsCache(USDC, undefined);
    writeDecimals(cache, USDC, 6);
    expect(readDecimals(cache, DAI, undefined)).toBeUndefined();
    expect(readDecimals(cache, USDC, undefined)).toBeUndefined();
  });

  it("survives switching away and back without resurrecting stale data", () => {
    const cache = createDecimalsCache(USDC, 6);
    readDecimals(cache, DAI, 18);
    writeDecimals(cache, DAI, 18);
    // Back to USDC: the DAI value must not be reused.
    expect(readDecimals(cache, USDC, 6)).toBe(6);
  });
});
