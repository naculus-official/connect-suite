/**
 * useExecuteRoute — execute a quoted cross-chain route once.
 *
 * Types, the recipient check and error normalization live in
 * `@naculus/connect-appkit-core` (`routing`), shared with the Vue composable.
 */

import {
  type ExecutableQuote,
  type ExecuteRoute,
  type ExecuteRouteError,
  type ExecuteRouteOptions,
  type ExecuteRouteResult,
  toExecuteRouteError,
  validateRouteRecipient,
} from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type Quote = ExecutableQuote;
export type ExecuteOptions = ExecuteRouteOptions;
export type ExecuteError = ExecuteRouteError;
export type { ExecuteRouteResult };

export interface UseExecuteRouteReturn {
  execute: (
    quote: Quote,
    recipient: string,
    options?: ExecuteOptions,
  ) => Promise<ExecuteRouteResult | null>;
  executing: boolean;
  result: ExecuteRouteResult | null;
  error: ExecuteError | null;
  reset: () => void;
}

export function useExecuteRoute(
  executeRouteFn?: ExecuteRoute,
): UseExecuteRouteReturn {
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteRouteResult | null>(null);
  const [error, setError] = useState<ExecuteError | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (
      quote: Quote,
      recipient: string,
      options?: ExecuteOptions,
    ): Promise<ExecuteRouteResult | null> => {
      if (!executeRouteFn) {
        setError({
          code: "no_executor",
          message: "No executeRoute function provided",
        });
        // Clear any earlier success too. A UI showing last run's transaction
        // hash next to this error reads as though something was sent.
        setResult(null);
        return null;
      }

      const recipientError = validateRouteRecipient(quote, recipient);
      if (recipientError) {
        setError(recipientError);
        setResult(null);
        return null;
      }

      // A cross-chain transfer must not be submitted twice because a button was
      // pressed twice. Matches useSendUserOperation.
      if (inFlightRef.current) {
        setError({
          code: "execution_in_progress",
          message: "A route execution is already in progress",
        });
        return null;
      }

      inFlightRef.current = true;
      setExecuting(true);
      setError(null);
      setResult(null);
      try {
        const execResult = await executeRouteFn(quote, recipient, options);
        if (mountedRef.current) setResult(execResult);
        return execResult;
      } catch (err) {
        if (mountedRef.current) setError(toExecuteRouteError(err));
        return null;
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setExecuting(false);
      }
    },
    [executeRouteFn],
  );

  const reset = useCallback(() => {
    // Deliberately does not clear inFlightRef: a request already sent to the
    // executor is still out there, and letting reset() unlock the guard would
    // permit exactly the double submission it exists to prevent.
    setResult(null);
    setError(null);
    setExecuting(false);
  }, []);

  return { execute, executing, result, error, reset };
}
