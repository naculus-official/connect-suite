import { describe, expect, it } from "vitest";
import { tokenChainMismatch } from "./token-chain";

/**
 * The guard exists because the same address holds different contracts on
 * different chains. Approving on the wrong one grants a spender rights over
 * an asset the user never inspected.
 */

const usdc = {
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const,
  chainId: 1,
};

describe("tokenChainMismatch", () => {
  it("is silent when the token is on the active chain", () => {
    expect(tokenChainMismatch(usdc, 1)).toBeUndefined();
  });

  it("reports a mismatch naming both chains", () => {
    const err = tokenChainMismatch(usdc, 137);
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/chain 1/);
    expect(err!.message).toMatch(/chain 137/);
    expect(err!.code).toBe("chain_mismatch");
  });

  it("stays silent when the token config carries no chain", () => {
    // A gap in what the caller supplied is not evidence of a mismatch.
    expect(
      tokenChainMismatch({ address: usdc.address } as never, 1),
    ).toBeUndefined();
  });

  it("stays silent when no chain is connected yet", () => {
    expect(tokenChainMismatch(usdc, undefined)).toBeUndefined();
  });

  it("does not treat NaN as a chain", () => {
    // NaN === NaN is false, so an unguarded comparison would report every
    // token as mismatched the moment a parse failed upstream.
    expect(tokenChainMismatch(usdc, Number.NaN)).toBeUndefined();
    expect(
      tokenChainMismatch({ ...usdc, chainId: Number.NaN }, 1),
    ).toBeUndefined();
  });

  it("does not import a UI framework", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./token-chain.ts", import.meta.url), "utf8"),
    );
    expect(source).not.toMatch(/from "react"/);
    expect(source).not.toMatch(/from "vue"/);
  });
});
