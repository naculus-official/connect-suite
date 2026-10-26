import {
  isBurnAddress,
  isEvmAddress,
  isZeroAddress,
} from "@naculus/connect-core";

/**
 * Destination-address checks shared by the React hook and the Vue composable.
 *
 * Syntactic only. `"ok"` means none of these checks found anything wrong —
 * not that the recipient is who the user thinks. This cannot see an
 * address-poisoning lookalike, a contract that will not release the funds,
 * or a known-malicious destination. Labelling that "safe" once put a green
 * tick beside a scammer's address; the level is deliberately not "safe".
 */

export type AddressValidationLevel = "ok" | "warning" | "blocked";

/** Machine-readable reason; the framework layer maps it to a user string. */
export type DestinationIssue =
  | "empty"
  | "invalid_format"
  | "zero_address"
  | "burn_address";

export interface DestinationValidation {
  isValid: boolean;
  level: AddressValidationLevel;
  issue: DestinationIssue | null;
}

/**
 * connect-core's `isBurnAddress` is the single definition (sinks, vanity
 * prefixes, "dead" anywhere) since connect-lib 0.2.6; this name stays for
 * callers that imported it.
 */
export function isBurnDestination(address: string): boolean {
  return isBurnAddress(address);
}

export function validateDestination(address: string): DestinationValidation {
  if (!address) return { isValid: false, level: "blocked", issue: "empty" };
  if (!isEvmAddress(address)) {
    return { isValid: false, level: "blocked", issue: "invalid_format" };
  }
  if (isZeroAddress(address)) {
    return { isValid: false, level: "blocked", issue: "zero_address" };
  }
  if (isBurnDestination(address)) {
    return { isValid: false, level: "blocked", issue: "burn_address" };
  }
  // Nothing wrong was found. That is not the same as safe.
  return { isValid: true, level: "ok", issue: null };
}

/**
 * The bare `0x…` account from either a CAIP-10 id (`eip155:1:0x…`) or a plain
 * hex address; null when it is neither. Hooks and composables should not each
 * carry their own copy of this split.
 */
export function bareEvmAddress(
  account: string | null | undefined,
): `0x${string}` | null {
  if (!account) return null;
  const value = account.includes(":") ? account.split(":").pop() : account;
  return value && isEvmAddress(value) ? (value as `0x${string}`) : null;
}
