import type { MaybeRef, ShallowRef } from "vue";
import { unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export type SignMessageAction = (message: string) => Promise<string>;

export interface UseSignMessageReturn {
  signMessage: SignMessageAction;
  isSigning: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  reset: () => void;
}

/** Reactive state around a caller-owned message-signing action. */
export function useSignMessage(
  action: MaybeRef<SignMessageAction>,
): UseSignMessageReturn {
  const guard = useActionGuard();

  const signMessage: SignMessageAction = (message) => {
    const invoke = unref(action);
    return guard.run(() => invoke(message), "Signing failed");
  };

  return {
    signMessage,
    isSigning: guard.busy,
    error: guard.error,
    reset: guard.reset,
  };
}
