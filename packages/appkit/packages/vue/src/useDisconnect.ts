import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseDisconnectReturn {
  disconnect: () => Promise<void>;
  isDisconnecting: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  cleanup: () => void;
}

/** Disconnect through a caller-owned action, preserving React's no-op when already disconnected. */
export function useDisconnect(
  action: MaybeRef<() => Promise<void>>,
  status: MaybeRefOrGetter<string>,
): UseDisconnectReturn {
  const guard = useActionGuard();
  let inFlight: Promise<void> | null = null;

  const disconnect = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (toValue(status) === "disconnected") return Promise.resolve();
    const invoke = unref(action);
    const pending = guard
      .run(() => Promise.resolve().then(() => invoke()), "Disconnect failed")
      .catch(() => {})
      .finally(() => {
        if (inFlight === pending) inFlight = null;
      });
    inFlight = pending;
    return pending;
  };

  const cleanup = (): void => {
    guard.dispose();
  };
  return {
    disconnect,
    isDisconnecting: guard.busy,
    error: guard.error,
    cleanup,
  };
}
