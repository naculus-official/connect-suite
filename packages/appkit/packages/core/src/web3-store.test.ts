import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  eip155ChainIdToNumber,
  initialWeb3State,
  normalizeEip155ChainId,
  toEip155Accounts,
  web3Reducer,
  withRetry,
  withTimeout,
} from "./web3-store";

describe("core boundary", () => {
  it("does not import a UI framework", () => {
    // The whole point of this module is that Vue, Svelte or a native binding
    // can consume it unchanged. Asserting the absence structurally is what
    // keeps that true once someone adds "just one" hook here.
    const source = readFileSync(join(__dirname, "web3-store.ts"), "utf8");
    for (const framework of ["react", "vue", "svelte", "solid-js"]) {
      expect(source).not.toMatch(
        new RegExp(`from ["']${framework}(/|["'])`),
      );
    }
  });
});

describe("normalizeEip155ChainId", () => {
  it.each([
    ["eip155:137", "eip155:137"],
    ["eip155:0137", "eip155:137"],
    ["0x89", "eip155:137"],
    ["0X89", "eip155:137"],
    ["137", "eip155:137"],
  ])("normalizes %p to %p", (input, expected) => {
    expect(normalizeEip155ChainId(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    137,
    {},
    "",
    "eip155:abc",
    "0xzz",
    "solana:x",
    "eip155:0",
    "0x0",
    "0",
    String(Number.MAX_SAFE_INTEGER + 2),
  ])(
    "returns undefined for malformed wallet event %p",
    (input) => {
      // A wallet emitting garbage must not corrupt session state.
      expect(normalizeEip155ChainId(input)).toBeUndefined();
    },
  );
});

describe("toEip155Accounts", () => {
  it("qualifies bare addresses with the chain reference", () => {
    expect(toEip155Accounts(["0xabc"], "eip155:137")).toEqual([
      "eip155:137:0xabc",
    ]);
  });

  it("re-qualifies an account already carrying a different chain", () => {
    expect(toEip155Accounts(["eip155:1:0xabc"], "eip155:137")).toEqual([
      "eip155:137:0xabc",
    ]);
  });

  it("drops non-string and empty entries instead of emitting broken CAIP-10", () => {
    expect(toEip155Accounts([null, "", 5, "0xabc"], "eip155:1")).toEqual([
      "eip155:1:0xabc",
    ]);
  });

  it("returns empty for a chain id with no reference", () => {
    expect(toEip155Accounts(["0xabc"], "eip155")).toEqual([]);
  });
});

describe("web3Reducer", () => {
  it.each([
    ["SET_STATUS", "connected", "status"],
    ["SET_ACCOUNTS", ["0xabc"], "accounts"],
    ["SET_CHAIN", "eip155:1", "chainId"],
  ])("%s updates %s", (type, payload, key) => {
    const next = web3Reducer(initialWeb3State, {
      type,
      payload,
    } as never);
    expect(next[key as keyof typeof next]).toEqual(payload);
  });

  it("does not mutate the previous state", () => {
    const next = web3Reducer(initialWeb3State, {
      type: "SET_STATUS",
      payload: "connected",
    });
    expect(initialWeb3State.status).toBe("disconnected");
    expect(next).not.toBe(initialWeb3State);
  });

  it("RESET returns to the initial state", () => {
    const dirty = web3Reducer(
      web3Reducer(initialWeb3State, { type: "SET_STATUS", payload: "connected" }),
      { type: "SET_ACCOUNTS", payload: ["0xabc"] },
    );
    expect(web3Reducer(dirty, { type: "RESET" })).toEqual(initialWeb3State);
  });

  it("ignores an unknown action rather than clearing state", () => {
    const state = web3Reducer(initialWeb3State, {
      type: "SET_STATUS",
      payload: "connected",
    });
    expect(web3Reducer(state, { type: "NOPE" } as never)).toBe(state);
  });
});

describe("withTimeout / withRetry", () => {
  it("resolves before the deadline", async () => {
    await expect(withTimeout(Promise.resolve(1), 1000)).resolves.toBe(1);
  });

  it("rejects with the label once the deadline passes", async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 5, "Connect")).rejects.toThrow(
      /Connect timed out after 5ms/,
    );
  });

  it("retries then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("flaky");
      return "ok";
    });
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelay: 1 }),
    ).resolves.toBe("ok");
    expect(calls).toBe(3);
  });

  it("surfaces the last error when every attempt fails", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always down");
    });
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelay: 1 }),
    ).rejects.toThrow(/always down/);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("eip155ChainIdToNumber", () => {
  it.each([
    ["eip155:1", 1],
    ["eip155:137", 137],
    ["eip155:11155111", 11155111],
  ])("parses %s", (input, expected) => {
    expect(eip155ChainIdToNumber(input)).toBe(expected);
  });

  it.each([
    // parseInt stopped at the first non-digit, so this became 5 — Goerli —
    // and a Solana token list came back as an EVM one.
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    "xrpl:0",
    "eip155:0",
    "eip155:01",
    "eip155:",
    "eip155:abc",
    "137",
    "",
  ])("returns undefined for %p", (input) => {
    expect(eip155ChainIdToNumber(input)).toBeUndefined();
  });

  it("rejects a chain id beyond Number.MAX_SAFE_INTEGER", () => {
    expect(eip155ChainIdToNumber("eip155:9007199254740993")).toBeUndefined();
  });
});
