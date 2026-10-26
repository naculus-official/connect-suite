import {
  encodeErc20Approve,
  encodeErc20Transfer,
  encodeErc20TransferFrom,
} from "@naculus/connect-appkit-core";
import { ERC20_MIN_ABI } from "@naculus/connect-core";
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

const from = "0x1111111111111111111111111111111111111111";
const to = "0x2222222222222222222222222222222222222222";
const transferFromAbi = parseAbi([
  "function transferFrom(address from,address to,uint256 amount) returns (bool)",
]);

describe("shared ERC-20 calldata matches viem", () => {
  it.each([0n, 1n, 12345678901234567890n, (1n << 256n) - 1n])(
    "encodes transfer, approve, and transferFrom for %s",
    (amount) => {
      expect(encodeErc20Transfer(to, amount)).toBe(
        encodeFunctionData({
          abi: ERC20_MIN_ABI,
          functionName: "transfer",
          args: [to, amount],
        }),
      );
      expect(encodeErc20Approve(to, amount)).toBe(
        encodeFunctionData({
          abi: ERC20_MIN_ABI,
          functionName: "approve",
          args: [to, amount],
        }),
      );
      expect(encodeErc20TransferFrom(from, to, amount)).toBe(
        encodeFunctionData({
          abi: transferFromAbi,
          functionName: "transferFrom",
          args: [from, to, amount],
        }),
      );
    },
  );
});
