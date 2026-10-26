import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";
import type { SiwxResult, SiwxSignInAction } from "./siwx";

export interface UseSiwxAuthSessionOptions {
  result: MaybeRefOrGetter<SiwxResult | null>;
  isRestoring: MaybeRefOrGetter<boolean>;
  signIn: MaybeRef<SiwxSignInAction>;
  signOut: MaybeRef<() => Promise<void>>;
}

export interface UseSiwxAuthSessionReturn {
  isSignedIn: ComputedRef<boolean>;
  isRestoring: ComputedRef<boolean>;
  siwxResult: ComputedRef<SiwxResult | null>;
  isSigningIn: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  signIn: SiwxSignInAction;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/** Reactive auth view over caller-owned, already-validated SIWX persistence. */
export function useSiwxAuthSession(
  options: UseSiwxAuthSessionOptions,
): UseSiwxAuthSessionReturn {
  const guard = useActionGuard();

  const signIn: SiwxSignInAction = (input) =>
    guard.run(() => unref(options.signIn)(input), "SIWX sign-in failed");

  // Signing out supersedes any sign-in still in flight: its later completion
  // or failure must not republish.
  const signOut = async (): Promise<void> => {
    guard.reset();
    await unref(options.signOut)();
    guard.clearError();
  };

  const siwxResult = computed(() => toValue(options.result));
  return {
    isSignedIn: computed(() => siwxResult.value !== null),
    isRestoring: computed(() => toValue(options.isRestoring)),
    siwxResult,
    isSigningIn: guard.busy,
    error: guard.error,
    signIn,
    signOut,
    clearError: guard.clearError,
  };
}
