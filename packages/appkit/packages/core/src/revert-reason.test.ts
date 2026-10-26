import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeRevertReason, resolveRevertReason } from "./revert-reason";

/**
 * Revert text is what a user reads before deciding not to send a transaction,
 * and the payload comes from a contract, so it is untrusted input rendered in
 * a safety context. The inlined version padded a short payload with NULs when
 * the ABI length word overstated the data, and threw away the Panic code.
 */

/** Build `Error(string)` revert data, optionally lying about the length. */
function errorString(message: string, declaredLength?: number) {
  const bytes = new TextEncoder().encode(message);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
  const len = (declaredLength ?? bytes.length).toString(16).padStart(64, "0");
  return `0x08c379a0${"20".padStart(64, "0")}${len}${padded}`;
}

function panic(code: number) {
  return `0x4e487b71${code.toString(16).padStart(64, "0")}`;
}

describe("core boundary", () => {
  it("does not import a UI framework", () => {
    const source = readFileSync(join(__dirname, "revert-reason.ts"), "utf8");
    for (const f of ["react", "vue", "svelte", "solid-js"]) {
      expect(source).not.toMatch(new RegExp(`from ["']${f}(/|["'])`));
    }
  });
});

describe("decodeRevertReason — Error(string)", () => {
  it.each([
    "insufficient balance",
    "ERC20: transfer amount exceeds allowance",
    "a",
  ])("decodes %p", (message) => {
    expect(decodeRevertReason(errorString(message))).toBe(message);
  });

  it("works without the 0x prefix", () => {
    expect(decodeRevertReason(errorString("nope").slice(2))).toBe("nope");
  });

  it("refuses a payload that declares more data than it carries", () => {
    // Previously this produced the real prefix followed by NUL padding, which
    // reads as a legitimate reason string.
    expect(decodeRevertReason(errorString("short", 4096))).toBeUndefined();
  });

  it.each([0, -1])("refuses a declared length of %p", (len) => {
    expect(decodeRevertReason(errorString("x", len))).toBeUndefined();
  });

  it("refuses a truncated payload", () => {
    expect(decodeRevertReason("0x08c379a0")).toBeUndefined();
  });
});

describe("decodeRevertReason — Panic(uint256)", () => {
  it.each([
    [0x11, /arithmetic overflow/],
    [0x12, /division or modulo by zero/],
    [0x32, /array index out of bounds/],
    [0x01, /assertion failed/],
  ])("names panic %s", (code, pattern) => {
    expect(decodeRevertReason(panic(code as number))).toMatch(
      pattern as RegExp,
    );
  });

  it("surfaces the raw code for an unlisted panic instead of a generic message", () => {
    // "Built-in failure" told the user nothing; the code is the whole signal.
    expect(decodeRevertReason(panic(0x41))).toBe("Panic 0x41");
  });

  it("includes the hex code alongside the name", () => {
    expect(decodeRevertReason(panic(0x11))).toContain("0x11");
  });
});

describe("decodeRevertReason — rejections", () => {
  it.each([undefined, null, 42, {}, "", "0xdeadbeef", "0xzzzz", "not hex"])(
    "returns undefined for %p",
    (input) => {
      expect(decodeRevertReason(input)).toBeUndefined();
    },
  );
});

describe("resolveRevertReason", () => {
  it("prefers a decoded reason over the node message", () => {
    expect(
      resolveRevertReason(errorString("out of funds"), "execution reverted"),
    ).toBe("out of funds");
  });

  it("falls back to the node message when it mentions a revert", () => {
    expect(resolveRevertReason(undefined, "execution reverted: bad")).toBe(
      "execution reverted: bad",
    );
  });

  it("does not present an unrelated RPC error as a revert reason", () => {
    expect(resolveRevertReason(undefined, "connection refused")).toBe(
      "Transaction reverted",
    );
  });
});
