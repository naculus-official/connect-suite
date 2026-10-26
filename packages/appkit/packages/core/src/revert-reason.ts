/**
 * Decode an EVM revert payload into something a user can act on.
 *
 * This text is what a wallet shows when a simulation says a transaction would
 * fail, so it is worth getting right and worth sharing: the logic is pure and
 * every binding needs the same answer.
 *
 * Two things are handled that the inlined version did not. The ABI length
 * word is attacker-controlled, so a payload can declare a longer string than
 * it carries; decoding that produced a run of NUL bytes rather than an honest
 * "could not decode". And a Panic was reported as "Built-in failure" with the
 * code discarded, which is the one piece of information that distinguishes an
 * overflow from a division by zero.
 */

/** keccak256("Error(string)")[0:4] */
const ERROR_STRING_SELECTOR = "08c379a0";
/** keccak256("Panic(uint256)")[0:4] */
const PANIC_SELECTOR = "4e487b71";

/**
 * Panic codes defined by Solidity. Unlisted codes still surface their raw
 * value rather than being flattened into a generic message.
 */
const PANIC_REASONS: Record<number, string> = {
  1: "assertion failed",
  17: "arithmetic overflow or underflow",
  18: "division or modulo by zero",
  33: "invalid enum value",
  49: "pop() on an empty array",
  50: "array index out of bounds",
};

function hexToUtf8(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * @param data Raw revert data from the node, with or without the 0x prefix.
 * @returns The decoded reason, or undefined when the payload is not a shape
 *   this understands — callers should fall back to the RPC error text rather
 *   than presenting a guess.
 */
export function decodeRevertReason(data: unknown): string | undefined {
  if (typeof data !== "string" || data.length === 0) return undefined;
  const clean = data.startsWith("0x") ? data.slice(2) : data;
  if (!/^[0-9a-fA-F]*$/.test(clean)) return undefined;

  if (clean.startsWith(ERROR_STRING_SELECTOR)) {
    // selector(8) + offset(64) + length(64) + payload
    if (clean.length < 136) return undefined;
    const declared = Number.parseInt(clean.slice(72, 136), 16);
    if (!Number.isSafeInteger(declared) || declared <= 0) return undefined;
    const available = (clean.length - 136) / 2;
    // Refuse a payload that promises more than it carries instead of padding
    // the difference with NULs and calling it a revert reason.
    if (declared > available) return undefined;
    return hexToUtf8(clean.slice(136, 136 + declared * 2));
  }

  if (clean.startsWith(PANIC_SELECTOR)) {
    if (clean.length < 8 + 64) return "Panic";
    const code = Number.parseInt(clean.slice(8, 72), 16);
    if (!Number.isSafeInteger(code)) return "Panic";
    const known = PANIC_REASONS[code];
    const hex = `0x${code.toString(16).padStart(2, "0")}`;
    return known ? `Panic ${hex}: ${known}` : `Panic ${hex}`;
  }

  return undefined;
}

/** Decoded reason if available, otherwise the node's own message. */
export function resolveRevertReason(
  data: unknown,
  fallbackMessage: string,
): string {
  return (
    decodeRevertReason(data) ??
    (fallbackMessage.includes("revert")
      ? fallbackMessage
      : "Transaction reverted")
  );
}
