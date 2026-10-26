import type { MaybeRef, ShallowRef } from "vue";
import { shallowRef, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";
import type { SiwxResult, SiwxSignInAction } from "./siwx";

export interface UseSignInWithXReturn {
  signIn: SiwxSignInAction;
  isSigningIn: ShallowRef<boolean>;
  result: ShallowRef<SiwxResult | null>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
  reset: () => void;
}

/** Reactive state around a caller-owned SIWX sign-in action. */
export function useSignInWithX(
  action: MaybeRef<SiwxSignInAction>,
): UseSignInWithXReturn {
  // The previous contract is exactly the guard's: counted busy flag,
  // newest-only error and result, rethrow, reset() and clearError().
  const guard = useActionGuard();
  const result = shallowRef<SiwxResult | null>(null);

  const signIn: SiwxSignInAction = (options) => {
    const invoke = unref(action);
    return guard.run(async (commit) => {
      const next = await invoke(options);
      commit(() => {
        result.value = next;
      });
      return next;
    }, "SIWX sign-in failed");
  };
  const reset = (): void => {
    guard.reset();
    result.value = null;
  };

  return {
    signIn,
    isSigningIn: guard.busy,
    result,
    error: guard.error,
    clearError: guard.clearError,
    reset,
  };
}
