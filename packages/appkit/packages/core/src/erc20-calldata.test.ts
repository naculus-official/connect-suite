import { toChecksumAddress } from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import {
  encodeErc20Approve,
  encodeErc20Transfer,
  encodeErc20TransferFrom,
} from "./erc20-calldata";

const lower = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const other = "0x1111111111111111111111111111111111111111";
const word = lower.slice(2).padStart(64, "0");
const otherWord = other.slice(2).padStart(64, "0");

describe("ERC-20 calldata", () => {
  it("encodes selectors and ABI words exactly", () => {
    expect(encodeErc20Transfer(lower, 1n)).toBe(
      `0xa9059cbb${word}${"1".padStart(64, "0")}`,
    );
    expect(encodeErc20Approve(lower, 0n)).toBe(
      `0x095ea7b3${word}${"0".repeat(64)}`,
    );
    expect(encodeErc20TransferFrom(other, lower, 2n)).toBe(
      `0x23b872dd${otherWord}${word}${"2".padStart(64, "0")}`,
    );
    expect(encodeErc20Transfer(toChecksumAddress(lower), 1n)).toBe(
      encodeErc20Transfer(lower, 1n),
    );
  });

  it("rejects malformed or incorrectly cased addresses", () => {
    for (const bad of [
      "0x123",
      lower.toUpperCase(),
      "0xAbcdefabcdefabcdefabcdefabcdefabcdefabcd",
      "not an address",
    ]) {
      expect(() => encodeErc20Transfer(bad, 1n)).toThrow(TypeError);
      expect(() => encodeErc20Approve(bad, 1n)).toThrow(TypeError);
      expect(() => encodeErc20TransferFrom(other, bad, 1n)).toThrow(TypeError);
    }
  });

  it("rejects negative, overflow, and non-bigint amounts; accepts max uint256", () => {
    const max = (1n << 256n) - 1n;
    expect(encodeErc20Transfer(lower, max).endsWith("f".repeat(64))).toBe(true);
    for (const bad of [-1n, max + 1n, 1 as unknown as bigint]) {
      expect(() => encodeErc20Transfer(lower, bad)).toThrow(RangeError);
      expect(() => encodeErc20Approve(lower, bad)).toThrow(RangeError);
      expect(() => encodeErc20TransferFrom(other, lower, bad)).toThrow(
        RangeError,
      );
    }
  });
});
