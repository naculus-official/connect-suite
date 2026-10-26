import { WalletError } from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import { toChainSwitchError } from "./provider-errors";

/**
 * Wallets report a declined switch and an unknown chain with different
 * EIP-1193 codes, and a caller needs to tell them apart: one is worth offering
 * to retry, the other cannot succeed until the chain is added.
 */

describe("toChainSwitchError", () => {
  it("maps 4001 to a rejection", () => {
    const error = toChainSwitchError(
      Object.assign(new Error("denied"), { code: 4001 }),
    );
    expect(error.code).toBe("chain_switch_rejected");
    expect(error.message).toBe("denied");
  });

  it("maps 4902 to unsupported and explains it", () => {
    const error = toChainSwitchError(
      Object.assign(new Error("unknown chain"), { code: 4902 }),
    );
    expect(error.code).toBe("chain_unsupported");
    expect(error.message).toMatch(/does not have this chain configured/);
  });

  it("reads a code the wallet sent as a string", () => {
    const error = toChainSwitchError(
      Object.assign(new Error("denied"), { code: "4001" }),
    );
    expect(error.code).toBe("chain_switch_rejected");
  });

  it("reads a code nested under data.originalError", () => {
    // WalletConnect wraps the wallet's error rather than re-throwing it.
    const error = toChainSwitchError({
      message: "wrapped",
      data: { originalError: { code: 4001 } },
    });
    expect(error.code).toBe("chain_switch_rejected");
  });

  it("passes a WalletError through untouched", () => {
    const original = new WalletError("session_expired", "gone");
    expect(toChainSwitchError(original)).toBe(original);
  });

  it("uses the caller's fallback when the wallet gave nothing to go on", () => {
    expect(toChainSwitchError(new Error("?")).code).toBe("chain_unsupported");
    expect(toChainSwitchError(new Error("?"), "rpc_error").code).toBe(
      "rpc_error",
    );
  });

  it.each([null, undefined, "string", 42, {}])(
    "survives %o without throwing",
    (bad) => {
      expect(toChainSwitchError(bad)).toBeInstanceOf(WalletError);
    },
  );

  it("keeps the original error for debugging", () => {
    const raw = Object.assign(new Error("denied"), { code: 4001 });
    expect(toChainSwitchError(raw).details).toBe(raw);
  });

  it("does not import a UI framework", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("./provider-errors.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from "react"/);
  });
});
