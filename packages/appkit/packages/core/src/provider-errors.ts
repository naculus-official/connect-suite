/**
 * Normalize an EIP-1193 provider error into a WalletError.
 *
 * Hooks were collapsing every non-WalletError into one code — `useSwitchChain`
 * labelled a user pressing Cancel as `chain_unsupported`, so the UI told them
 * the chain was unavailable when they had simply declined. The codes below are
 * the ones wallets actually send, and they mean different things to a caller:
 * one is retryable by asking again, the other is not retryable at all until
 * the chain is added.
 *
 * Framework-agnostic on purpose: it must not import React.
 */

import type { WalletErrorCode } from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";

/** EIP-1193: the user rejected the request. */
const USER_REJECTED = 4001;
/** EIP-3326: the wallet does not recognize the chain and must add it first. */
const UNRECOGNIZED_CHAIN = 4902;

function providerCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number") return code;
  // Some wallets stringify it, and some nest the original under `data`.
  if (typeof code === "string" && /^-?\d+$/.test(code)) return Number(code);
  const nested = (error as { data?: { originalError?: unknown } }).data
    ?.originalError;
  return nested ? providerCode(nested) : undefined;
}

/**
 * Map a chain-switch failure onto the code that describes it.
 *
 * `fallback` is used when the wallet gave nothing to go on, so the caller
 * still decides what an unexplained failure means in its own context.
 */
export function toChainSwitchError(
  error: unknown,
  fallback: WalletErrorCode = "chain_unsupported",
): WalletError {
  if (error instanceof WalletError) return error;

  const message =
    error instanceof Error
      ? error.message
      : "Unknown error during chain switch";

  switch (providerCode(error)) {
    case USER_REJECTED:
      return new WalletError("chain_switch_rejected", message, error);
    case UNRECOGNIZED_CHAIN:
      return new WalletError(
        "chain_unsupported",
        `${message} (the wallet does not have this chain configured)`,
        error,
      );
    default:
      return new WalletError(fallback, message, error);
  }
}
