import { isChecksumAddress } from "@naculus/connect-core";

const UINT256_MAX = (1n << 256n) - 1n;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function addressWord(address: string): string {
  if (
    typeof address !== "string" ||
    !EVM_ADDRESS.test(address) ||
    (address !== address.toLowerCase() && !isChecksumAddress(address))
  ) {
    throw new TypeError("Invalid EVM address checksum");
  }
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function uint256Word(value: bigint): string {
  if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) {
    throw new RangeError("Amount must be a uint256 bigint");
  }
  return value.toString(16).padStart(64, "0");
}

/** Encode ERC-20 transfer(address,uint256), without signing or broadcasting. */
export function encodeErc20Transfer(to: string, amount: bigint): `0x${string}` {
  return `0xa9059cbb${addressWord(to)}${uint256Word(amount)}`;
}

/** Encode ERC-20 approve(address,uint256), without signing or broadcasting. */
export function encodeErc20Approve(
  spender: string,
  amount: bigint,
): `0x${string}` {
  return `0x095ea7b3${addressWord(spender)}${uint256Word(amount)}`;
}

/** Encode ERC-20 transferFrom(address,address,uint256), without signing or broadcasting. */
export function encodeErc20TransferFrom(
  from: string,
  to: string,
  amount: bigint,
): `0x${string}` {
  return `0x23b872dd${addressWord(from)}${addressWord(to)}${uint256Word(amount)}`;
}
