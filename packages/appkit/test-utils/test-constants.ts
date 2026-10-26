/**
 * Test constants for connect-react — single source of truth.
 * Import from here instead of hardcoding addresses/values.
 */

const addr = (hex: string) => hex as `0x${string}`;

export const ADDRESSES = {
  ZERO: addr("0x0000000000000000000000000000000000000000"),
  ALICE: addr("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
  BOB: addr("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B"),
  TEST_1: addr("0x1234567890abcdef1234567890abcdef12345678"),
  TEST_2: addr("0x1234567890123456789012345678901234567890"),
} as const;
