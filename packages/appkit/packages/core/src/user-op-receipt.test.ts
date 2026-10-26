import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchUserOperationReceipt,
  InvalidUserOperationReceiptError,
  parseUserOperationReceipt,
} from "./user-op-receipt";

const HASH = `0x${"ab".repeat(32)}` as const;
const ADDR = "0x1111111111111111111111111111111111111111";
const receipt = {
  userOpHash: HASH,
  entryPoint: ADDR,
  sender: ADDR,
  nonce: "0x1",
  actualGasUsed: "21000",
  actualGasCost: "0x5208",
  success: true,
  transactionHash: `0x${"cd".repeat(32)}`,
  logs: [{ address: ADDR, topics: [HASH], data: "0x" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("parseUserOperationReceipt", () => {
  it("accepts a well-formed receipt and parses quantities as bigint", () => {
    const parsed = parseUserOperationReceipt(receipt, HASH);
    expect(parsed.nonce).toBe(1n);
    expect(parsed.actualGasUsed).toBe(21000n);
    expect(parsed.paymaster).toBeUndefined();
  });

  it("refuses a receipt for a different hash or with malformed fields", () => {
    expect(() =>
      parseUserOperationReceipt(receipt, `0x${"00".repeat(32)}`),
    ).toThrow(InvalidUserOperationReceiptError);
    expect(() =>
      parseUserOperationReceipt({ ...receipt, sender: "0x1" }, HASH),
    ).toThrow(/account address/);
    expect(() =>
      parseUserOperationReceipt({ ...receipt, nonce: "01" }, HASH),
    ).toThrow(/nonce/);
    expect(() =>
      parseUserOperationReceipt(
        { ...receipt, logs: [{ address: ADDR, topics: ["0x1"], data: "0x" }] },
        HASH,
      ),
    ).toThrow(/log entry/);
  });
});

describe("fetchUserOperationReceipt", () => {
  it("returns null while pending, the receipt once included, and throws on RPC error", async () => {
    const responses = [
      { ok: true, json: async () => ({ result: null }) },
      { ok: true, json: async () => ({ result: receipt }) },
      { ok: true, json: async () => ({ error: { message: "rate limited" } }) },
      { ok: false, status: 502, json: async () => ({}) },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responses.shift()),
    );
    expect(await fetchUserOperationReceipt("https://bundler", HASH)).toBeNull();
    expect(
      (await fetchUserOperationReceipt("https://bundler", HASH))?.success,
    ).toBe(true);
    await expect(
      fetchUserOperationReceipt("https://bundler", HASH),
    ).rejects.toThrow(/rate limited/);
    await expect(
      fetchUserOperationReceipt("https://bundler", HASH),
    ).rejects.toThrow(/HTTP 502/);
  });
});
