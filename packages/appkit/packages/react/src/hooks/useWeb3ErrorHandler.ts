"use client";

import { useCallback, useMemo } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { getUserFriendlyError, isRetryableError } from "../utils/errorMessages";

export interface UserFriendlyError {
  title: string;
  description: string;
  code?: string;
}

export interface UseWeb3ErrorHandlerReturn {
  /** Current error from the provider */
  error: Error | null;
  /** User-friendly representation of the current error */
  friendlyError: UserFriendlyError | null;
  /** Clear the current error */
  clearError: () => void;
  /** Check if current error is retryable */
  isRetryable: boolean;
  /** Get a user-friendly version of any error */
  formatError: (error: unknown) => UserFriendlyError;
  /** Wraps an async function with error formatting */
  wrapAsync: <T>(fn: () => Promise<T>) => () => Promise<T>;
}

/**
 * Hook that provides user-friendly error handling for web3 operations.
 *
 * Features:
 * - Maps WalletError codes to human-readable messages
 * - Provides retry detection for transient errors
 * - Wraps async operations with consistent error formatting
 * - Exposes the current error state from Web3ConnectProvider
 *
 * @example
 * ```tsx
 * const { friendlyError, clearError, isRetryable, wrapAsync } = useWeb3ErrorHandler();
 *
 * // Show error in UI
 * if (friendlyError) {
 *   return <ErrorDisplay title={friendlyError.title} message={friendlyError.description} />;
 * }
 *
 * // Wrap an operation
 * const safeConnect = wrapAsync(() => connect());
 * await safeConnect();
 * ```
 */
export function useWeb3ErrorHandler(): UseWeb3ErrorHandlerReturn {
  const { error, clearError: providerClearError } = useWeb3();

  const friendlyError: UserFriendlyError | null = useMemo(
    () => (error ? getUserFriendlyError(error) : null),
    [error],
  );

  const isRetryable = useMemo(
    () => (error ? isRetryableError(error) : false),
    [error],
  );

  const clearError = useCallback(() => {
    providerClearError();
  }, [providerClearError]);

  const formatError = useCallback(
    (err: unknown): UserFriendlyError => getUserFriendlyError(err),
    [],
  );

  const wrapAsync = useCallback(
    <T>(fn: () => Promise<T>): (() => Promise<T>) => {
      return async () => {
        try {
          return await fn();
        } catch (err) {
          const friendly = getUserFriendlyError(err);

          // Attach to the original rather than replacing it. Building a fresh
          // Error here discarded the only technical evidence of the failure:
          // the wallet's own message, any `details`, and — the part callers
          // actually notice — the class, so `err instanceof WalletError` never
          // matched again. A convenience wrapper must not make the SDK's own
          // error type unusable.
          if (err instanceof Error) {
            const target = err as Error & {
              title?: string;
              code?: unknown;
              friendlyMessage?: string;
            };
            try {
              target.title = friendly.title;
              target.friendlyMessage = friendly.description;
              // Only fill a code in when the error has none. Overwriting a
              // wallet's own code with one this module inferred from the
              // message text would hide the real reason behind a guess.
              if (target.code === undefined && friendly.code !== undefined) {
                target.code = friendly.code;
              }
            } catch {
              // A frozen error cannot be annotated; it is still the better
              // thing to re-throw.
            }
            throw target;
          }

          // Not an Error, so there is nothing to preserve the identity of.
          // `cause` keeps the original value reachable.
          throw Object.assign(new Error(friendly.description, { cause: err }), {
            title: friendly.title,
            code: friendly.code,
            friendlyMessage: friendly.description,
          });
        }
      };
    },
    [],
  );

  return {
    error,
    friendlyError,
    clearError,
    isRetryable,
    formatError,
    wrapAsync,
  };
}
