import type { MaybeRef, ShallowRef } from "vue";
import type { SiwxSignInAction } from "./siwx";
import { useSignInWithX } from "./useSignInWithX";

export interface UseSIWxLoginReturn {
  signIn: SiwxSignInAction;
  isSigningIn: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

/** Login-shaped view of the shared caller-owned SIWX sign-in shell. */
export function useSIWxLogin(
  action: MaybeRef<SiwxSignInAction>,
): UseSIWxLoginReturn {
  const state = useSignInWithX(action);
  return {
    signIn: state.signIn,
    isSigningIn: state.isSigningIn,
    error: state.error,
    clearError: state.clearError,
  };
}
