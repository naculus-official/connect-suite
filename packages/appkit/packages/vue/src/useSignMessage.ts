import type { MaybeRef, ShallowRef } from "vue";
import { unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export type SignMessageAction = (message: string) => Promise<string>;

export interface UseSignMessageReturn {
  signMessage: SignMessageAction;
  isSigning: ShallowRef<boolean>;
  /** The failure; `code` is the wallet's EIP-1193 code when it gave one. */
  error: ShallowRef<(Error & { code?: number | string }) | null>;
  reset: () => void;
}

/**
 * Keep the wallet's own reason on the hook error. EIP-1193 providers often
 * reject with a plain `{ code, message }` object rather than an Error, and
 * replacing that with a bare "Signing failed" left the app unable to tell
 * 4100 (not authorized) from any other wallet failure. An Error is passed
 * through untouched, so a 4001 rejection reads exactly as before.
 */
function toSignError(cause: unknown): Error & { code?: number | string } {
  if (cause instanceof Error) return cause;
  if (!cause || typeof cause !== "object") return new Error("Signing failed");
  const { code, message } = cause as { code?: unknown; message?: unknown };
  const error: Error & { code?: number | string } = new Error(
    typeof message === "string" && message ? message : "Signing failed",
    { cause },
  );
  if (typeof code === "number" || typeof code === "string") error.code = code;
  return error;
}

/** Reactive state around a caller-owned message-signing action. */
export function useSignMessage(
  action: MaybeRef<SignMessageAction>,
): UseSignMessageReturn {
  const guard = useActionGuard();

  const signMessage: SignMessageAction = (message) => {
    const invoke = unref(action);
    return guard.run(() => invoke(message), "Signing failed", toSignError);
  };

  return {
    signMessage,
    isSigning: guard.busy,
    error: guard.error as ShallowRef<
      (Error & { code?: number | string }) | null
    >,
    reset: guard.reset,
  };
}
