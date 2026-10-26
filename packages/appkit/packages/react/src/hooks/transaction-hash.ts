import { WalletError } from "@naculus/connect-core";

/** Normalize connector-specific send results without accepting fake success. */
export function extractTransactionHash(result: unknown): string {
  const candidate =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && "hash" in result
        ? (result as { hash?: unknown }).hash
        : undefined;

  if (typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate)) {
    return candidate;
  }

  throw new WalletError(
    "tx_failed",
    "Wallet did not return a valid 32-byte transaction hash",
  );
}
