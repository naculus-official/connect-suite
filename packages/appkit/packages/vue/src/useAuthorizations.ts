import {
  type AuthorizationManagers,
  type ListedAuthorization,
  listAuthorizations,
  type RevokeListedAuthorizationResult,
  revokeListedAuthorization,
} from "@naculus/connect-core";
import type { MaybeRef, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, unref, watch } from "vue";

export interface UseAuthorizationsOptions {
  managers: MaybeRef<AuthorizationManagers>;
}

export interface UseAuthorizationsReturn {
  entries: ShallowRef<ListedAuthorization[]>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refresh: () => Promise<void>;
  revoke: (
    entry: ListedAuthorization,
  ) => Promise<RevokeListedAuthorizationResult>;
}

/** Reactive shell over the caller-owned authorization managers. */
export function useAuthorizations({
  managers,
}: UseAuthorizationsOptions): UseAuthorizationsReturn {
  const entries = shallowRef<ListedAuthorization[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let generation = 0;
  let disposed = false;

  const refresh = async () => {
    const own = ++generation;
    loading.value = true;
    error.value = null;
    try {
      const next = await listAuthorizations(unref(managers));
      if (!disposed && own === generation) entries.value = next;
    } catch (cause) {
      if (!disposed && own === generation) {
        error.value =
          cause instanceof Error
            ? cause
            : new Error("Failed to list authorizations");
      }
    } finally {
      if (!disposed && own === generation) loading.value = false;
    }
  };

  const stop = watch(() => unref(managers), refresh, { immediate: true });
  onScopeDispose(() => {
    disposed = true;
    generation += 1;
    stop();
  });

  const revoke = async (entry: ListedAuthorization) => {
    try {
      const result = await revokeListedAuthorization(unref(managers), entry);
      await refresh();
      return result;
    } catch (cause) {
      const normalized =
        cause instanceof Error
          ? cause
          : new Error("Failed to revoke authorization");
      if (!disposed) error.value = normalized;
      throw normalized;
    }
  };

  return { entries, loading, error, refresh, revoke };
}
