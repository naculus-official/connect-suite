import { DEFAULT_ENTRY_POINT } from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import {
  assertHexSignature,
  buildSmartAccountConfig,
  resolveUserOpChain,
} from "./smart-account";

const OWNER = "0x1111111111111111111111111111111111111111";

describe("smart-account decisions", () => {
  it("resolves the chain and fails closed on absence or mismatch", () => {
    expect(resolveUserOpChain("eip155:8453", undefined)).toBe("eip155:8453");
    expect(resolveUserOpChain(undefined, "eip155:1")).toBe("eip155:1");
    expect(() => resolveUserOpChain(undefined, undefined)).toThrow(
      /No EVM chain/,
    );
    expect(() => resolveUserOpChain("solana:x", undefined)).toThrow(
      /Invalid EVM chain/,
    );
    expect(() => resolveUserOpChain("eip155:10", "eip155:1")).toThrow(
      /does not match/,
    );
  });

  it("builds the account config with defaults and per-chain entry point", () => {
    const config = buildSmartAccountConfig(OWNER, "eip155:1", {});
    expect(config).toMatchObject({
      owner: OWNER,
      accountType: "simple",
      chainId: "eip155:1",
    });
    expect(config.entryPoint).toMatch(/^0x/);
    expect(buildSmartAccountConfig(OWNER, "eip155:999999", {}).entryPoint).toBe(
      DEFAULT_ENTRY_POINT,
    );
    expect(
      buildSmartAccountConfig(OWNER, "eip155:1", {
        accountType: "kernel",
        salt: 7n,
      }).salt,
    ).toBe(7n);
  });

  it("accepts only non-empty even-length hex as a signature", () => {
    expect(assertHexSignature("0xabcd")).toBe("0xabcd");
    for (const bad of ["0x", "0xabc", "abcd", 12, null]) {
      expect(() => assertHexSignature(bad)).toThrow(
        /invalid UserOperation signature/,
      );
    }
  });
});
