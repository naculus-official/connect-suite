import {
  type ExecutableQuote,
  type ExecuteRoute,
  type ExecuteRouteError,
  type ExecuteRouteOptions,
  type ExecuteRouteResult,
  toExecuteRouteError,
  validateRouteRecipient,
} from "@naculus/connect-appkit-core";
import type { MaybeRef, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, unref } from "vue";

export interface UseExecuteRouteReturn {
  execute: (
    quote: ExecutableQuote,
    recipient: string,
    options?: ExecuteRouteOptions,
  ) => Promise<ExecuteRouteResult | null>;
  executing: ShallowRef<boolean>;
  result: ShallowRef<ExecuteRouteResult | null>;
  error: ShallowRef<ExecuteRouteError | null>;
  reset: () => void;
}

/**
 * Execute a quoted route once through a caller-supplied executor, mirroring
 * the React hook. The recipient check and error shape are appkit-core's. A
 * second call while one is in flight is refused, and `reset()` deliberately
 * does not unlock that guard: the first request is still out there. This is a
 * side-effect single-flight contract, not the shared action guard's
 * latest-error publication contract, so it intentionally remains local.
 */
export function useExecuteRoute(
  executeRoute?: MaybeRef<ExecuteRoute | null | undefined>,
): UseExecuteRouteReturn {
  const executing = shallowRef(false);
  const result = shallowRef<ExecuteRouteResult | null>(null);
  const error = shallowRef<ExecuteRouteError | null>(null);
  let inFlight = false;
  let disposed = false;

  const execute = async (
    quote: ExecutableQuote,
    recipient: string,
    options?: ExecuteRouteOptions,
  ): Promise<ExecuteRouteResult | null> => {
    const fn = unref(executeRoute);
    if (!fn) {
      error.value = {
        code: "no_executor",
        message: "No executeRoute function provided",
      };
      result.value = null;
      return null;
    }
    const recipientError = validateRouteRecipient(quote, recipient);
    if (recipientError) {
      error.value = recipientError;
      result.value = null;
      return null;
    }
    if (inFlight) {
      error.value = {
        code: "execution_in_progress",
        message: "A route execution is already in progress",
      };
      return null;
    }
    inFlight = true;
    executing.value = true;
    error.value = null;
    result.value = null;
    try {
      const execResult = await fn(quote, recipient, options);
      if (!disposed) result.value = execResult;
      return execResult;
    } catch (cause) {
      if (!disposed) error.value = toExecuteRouteError(cause);
      return null;
    } finally {
      inFlight = false;
      if (!disposed) executing.value = false;
    }
  };

  onScopeDispose(() => {
    disposed = true;
  });

  return {
    execute,
    executing,
    result,
    error,
    reset: () => {
      result.value = null;
      error.value = null;
      executing.value = false;
    },
  };
}
