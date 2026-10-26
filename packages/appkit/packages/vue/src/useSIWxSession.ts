import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";
import type { SiwxSessionLike, SiwxSignInOptions } from "./siwx";

export interface UseSIWxSessionOptions {
  session: MaybeRefOrGetter<SiwxSessionLike | null>;
  isRestoring: MaybeRefOrGetter<boolean>;
  isExpired: MaybeRefOrGetter<boolean>;
  timeUntilExpiry: MaybeRefOrGetter<number | null>;
  signIn: MaybeRef<(options?: SiwxSignInOptions) => Promise<SiwxSessionLike>>;
  signOut: MaybeRef<() => Promise<void>>;
  refresh: MaybeRef<() => Promise<SiwxSessionLike>>;
}

export interface UseSIWxSessionReturn {
  session: ComputedRef<SiwxSessionLike | null>;
  isAuthenticated: ComputedRef<boolean>;
  isRestoring: ComputedRef<boolean>;
  isSigningIn: ShallowRef<boolean>;
  isExpired: ComputedRef<boolean>;
  timeUntilExpiry: ComputedRef<number | null>;
  signIn: (options?: SiwxSignInOptions) => Promise<SiwxSessionLike>;
  signOut: () => Promise<void>;
  refresh: () => Promise<SiwxSessionLike>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

/** Reactive view over caller-owned SIWX session lifecycle and policy state. */
export function useSIWxSession(
  options: UseSIWxSessionOptions,
): UseSIWxSessionReturn {
  const guard = useActionGuard();
  return {
    session: computed(() => toValue(options.session)),
    isAuthenticated: computed(
      () => toValue(options.session) !== null && !toValue(options.isExpired),
    ),
    isRestoring: computed(() => toValue(options.isRestoring)),
    isSigningIn: guard.busy,
    isExpired: computed(() => toValue(options.isExpired)),
    timeUntilExpiry: computed(() => toValue(options.timeUntilExpiry)),
    signIn: (input) =>
      guard.run(() => unref(options.signIn)(input), "SIWX sign-in failed"),
    signOut: async () => {
      await unref(options.signOut)();
      guard.clearError();
    },
    refresh: () =>
      guard.run(() => unref(options.refresh)(), "Session refresh failed"),
    error: guard.error,
    clearError: guard.clearError,
  };
}
