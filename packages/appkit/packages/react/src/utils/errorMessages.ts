/**
 * User-friendly error messages for WalletError codes and common errors.
 * Maps internal error codes to human-readable messages that can be shown in toasts/UI.
 */

import type { WalletErrorCode } from "@naculus/connect-core";

/**
 * User-friendly title for each WalletError code.
 */
export const WALLET_ERROR_TITLES: Record<string, string> = {
  wallet_unavailable: "Wallet Not Detected",
  user_rejected: "Connection Rejected",
  deeplink_timeout: "Wallet Connection Timed Out",
  session_expired: "Session Expired",
  intent_expired: "Connection Request Expired",
  namespace_mismatch: "Network Mismatch",
  chain_unsupported: "Unsupported Network",
  method_not_allowed: "Action Not Allowed",
  signature_rejected: "Signature Rejected",
  tx_failed: "Transaction Failed",
};

/**
 * User-friendly description for each WalletError code.
 */
export const WALLET_ERROR_DESCRIPTIONS: Record<string, string> = {
  wallet_unavailable:
    "No wallet found. Please install a compatible wallet (e.g., MetaMask, WalletConnect) and try again.",
  user_rejected: "The connection request was declined in your wallet. You can try again whenever you're ready.",
  deeplink_timeout:
    "The wallet didn't respond in time. This can happen if the wallet app isn't installed or takes too long to open.",
  session_expired:
    "Your wallet session has expired. Please reconnect to continue.",
  intent_expired:
    "The connection request expired. Please try connecting again.",
  namespace_mismatch:
    "This wallet doesn't support the required network. Try using a different wallet or network.",
  chain_unsupported:
    "This network isn't supported. Please switch to a supported network in your wallet.",
  method_not_allowed:
    "This action isn't supported by your current wallet or network.",
  signature_rejected: "The signature request was declined in your wallet.",
  tx_failed:
    "The transaction couldn't be completed. This could be due to insufficient funds, network congestion, or a contract error.",
};

/**
 * Default title for unknown errors.
 */
export const UNKNOWN_ERROR_TITLE = "Something went wrong";

/**
 * Default description for unknown errors.
 */
export const UNKNOWN_ERROR_DESCRIPTION =
  "An unexpected error occurred. Please try again. If the problem persists, check your connection and wallet configuration.";

/**
 * Get a user-friendly error message object from any error.
 */
export function getUserFriendlyError(
  error: unknown
): { title: string; description: string; code?: string } {
  if (!error) {
    return { title: UNKNOWN_ERROR_TITLE, description: UNKNOWN_ERROR_DESCRIPTION };
  }

  // Check for WalletError with code
  const maybeWalletError = error as { name?: string; code?: string; message?: string };
  if (maybeWalletError.name === "WalletError" && maybeWalletError.code) {
    const code = maybeWalletError.code;
    const title = WALLET_ERROR_TITLES[code] ?? UNKNOWN_ERROR_TITLE;
    const description =
      WALLET_ERROR_DESCRIPTIONS[code] ?? maybeWalletError.message ?? UNKNOWN_ERROR_DESCRIPTION;
    return { title, description, code };
  }

  // Check for standard Error
  if (error instanceof Error) {
    const message = error.message;
    // Map common error patterns
    if (/user rejected/i.test(message) || /rejected/.test(message)) {
      return {
        title: "Request Rejected",
        description: "The request was declined.",
        code: "user_rejected",
      };
    }
    if (/timeout/i.test(message) || /timed? ?out/i.test(message)) {
      return {
        title: "Request Timed Out",
        description: "The request took too long. Please try again.",
        code: "deeplink_timeout",
      };
    }
    // Specific before generic: "insufficient funds on chain 1" also matches
    // /chain/i, and reporting that as a network problem sends the user to
    // check their connection instead of their balance.
    if (/insufficient funds/i.test(message)) {
      return {
        title: "Insufficient Funds",
        description: "You don't have enough funds to complete this transaction.",
        code: "tx_failed",
      };
    }
    if (/network/i.test(message) || /chain/i.test(message)) {
      return {
        title: "Network Error",
        description: message,
        code: "chain_unsupported",
      };
    }

    return {
      title: UNKNOWN_ERROR_TITLE,
      description: message || UNKNOWN_ERROR_DESCRIPTION,
    };
  }

  // String error
  if (typeof error === "string") {
    return {
      title: UNKNOWN_ERROR_TITLE,
      description: error || UNKNOWN_ERROR_DESCRIPTION,
    };
  }

  return { title: UNKNOWN_ERROR_TITLE, description: UNKNOWN_ERROR_DESCRIPTION };
}

/**
 * Check if an error is retryable (transient).
 */
export function isRetryableError(error: unknown): boolean {
  // A rejected promise with no reason gives `undefined` here. Reading `.name`
  // off it threw, so the error handler crashed while handling an error and
  // buried whatever actually went wrong.
  if (error === null || typeof error !== "object") return false;
  const maybe = error as { name?: string; code?: string; message?: string };
  if (maybe.name !== "WalletError" || !maybe.code) return false;
  const retryableCodes: WalletErrorCode[] = [
    "deeplink_timeout",
    "session_expired",
    "intent_expired",
    "tx_failed",
  ];
  return retryableCodes.includes(maybe.code as WalletErrorCode);
}
