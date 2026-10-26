import { describe, expect, it } from "vitest";
import { isEvmChainId, resolveEvmChainId } from "./aa-chain";

/**
 * The behavior under test is a refusal. These hooks used to fall back to
 * `eip155:1`, and the chain-mismatch guard was skipped on exactly that path,
 * so the assumption was never checked against anything.
 */

describe("resolveEvmChainId", () => {
  it("prefers an explicitly requested chain", () => {
    expect(resolveEvmChainId("eip155:137", "eip155:1")).toBe("eip155:137");
  });

  it("falls back to the connected chain", () => {
    expect(resolveEvmChainId(undefined, "eip155:8453")).toBe("eip155:8453");
  });

  it("treats an explicit null the same as absent", () => {
    // useWeb3 reports no chain as null, not undefined.
    expect(resolveEvmChainId(null, null)).toBeUndefined();
    expect(resolveEvmChainId(null, "eip155:1")).toBe("eip155:1");
  });

  it("resolves nothing when neither is known", () => {
    // Not "eip155:1". A UserOperation built here would be signed against
    // mainnet's EntryPoint while the configured bundler points elsewhere.
    expect(resolveEvmChainId(undefined, undefined)).toBeUndefined();
  });

  it("refuses a malformed request rather than falling back", () => {
    // The caller asked for something specific and got it wrong; quietly using
    // the connected chain instead would hide the mistake.
    expect(resolveEvmChainId("mainnet", "eip155:1")).toBeUndefined();
    expect(resolveEvmChainId("1", "eip155:1")).toBeUndefined();
  });

  it("refuses a non-EVM namespace", () => {
    expect(
      resolveEvmChainId(
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        undefined,
      ),
    ).toBeUndefined();
    expect(resolveEvmChainId(undefined, "xrpl:0")).toBeUndefined();
  });
});

describe("isEvmChainId", () => {
  it.each(["eip155:1", "eip155:137", "eip155:42161", "eip155:11155111"])(
    "accepts %s",
    (id) => expect(isEvmChainId(id)).toBe(true),
  );

  it.each([
    "eip155:0",
    "eip155:01",
    "eip155:",
    "eip155",
    "eip155:1a",
    "eip155:-1",
    "",
    undefined,
  ])("rejects %o", (id) => expect(isEvmChainId(id as string)).toBe(false));

  it("does not import a UI framework", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("./aa-chain.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from "react"/);
  });
});
