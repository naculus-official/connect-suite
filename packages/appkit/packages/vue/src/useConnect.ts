import { WalletError } from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseConnectReturn {
  connect: () => Promise<void>;
  isConnecting: ComputedRef<boolean>;
  error: ShallowRef<Error | null>;
}

/** Connection state around a caller-owned action; never connects on mount. */
export function useConnect(
  action: MaybeRef<() => Promise<void>>,
  status: MaybeRefOrGetter<string>,
): UseConnectReturn {
  const guard = useActionGuard();
  let inFlight: Promise<void> | null = null;

  const connect = (): Promise<void> => {
    if (inFlight) return inFlight;
    const invoke = unref(action);
    const pending = guard
      .run(
        () => Promise.resolve().then(() => invoke()),
        "Connection failed",
        (cause) => {
          const message =
            cause instanceof Error ? cause.message : "Connection failed";
          return cause instanceof WalletError ? cause : new Error(message);
        },
      )
      .catch(() => {})
      .finally(() => {
        if (inFlight === pending) inFlight = null;
      });
    inFlight = pending;
    return pending;
  };

  return {
    connect,
    isConnecting: computed(
      () => guard.busy.value || toValue(status) === "connecting",
    ),
    error: guard.error,
  };
}
