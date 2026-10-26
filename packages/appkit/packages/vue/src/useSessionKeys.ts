import {
  checkSessionKeyRailGrant,
  type Eip3009SessionKeyRail,
  getSharedSessionKeyManager,
  type SessionKeyRailGrantCheck,
} from "@naculus/connect-appkit-core";
import type {
  ScopeCheckResult,
  SessionKeyInfo,
  SessionKeyManager,
  SessionKeyManagerConfig,
  SessionKeyScope,
  SessionKeyTransaction,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, onScopeDispose, shallowRef, toValue, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

/**
 * Vue counterparts of the React session-key hooks. The SessionKeyManager —
 * key generation, encryption at rest, scope enforcement, fail-closed signing
 * — is connect-core's; the shared instance and its config guard are
 * appkit-core's. These composables only add reactivity. Private key material
 * never reaches them.
 */

export interface SessionKeyComposableOptions {
  /** Reuse a caller-owned manager instead of the shared process-wide one. */
  manager?: SessionKeyManager;
}

function resolveManager(
  config: SessionKeyManagerConfig | undefined,
  options: SessionKeyComposableOptions,
): SessionKeyManager {
  return options.manager ?? getSharedSessionKeyManager(config);
}

// ─── useSessionKeys ──────────────────────────────────────────────────

export interface UseSessionKeysReturn {
  sessions: ShallowRef<SessionKeyInfo[]>;
  activeSessions: ComputedRef<SessionKeyInfo[]>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refresh: () => Promise<void>;
  clearError: () => void;
  storageAvailable: boolean;
  checkRailGrant: (
    scope: SessionKeyScope | null | undefined,
    rail: Eip3009SessionKeyRail,
  ) => SessionKeyRailGrantCheck;
}

/**
 * Lists session keys while a wallet session is connected; an empty list
 * otherwise, as in React. `connected` is the caller's session state.
 */
export function useSessionKeys(
  connected: MaybeRefOrGetter<boolean>,
  config?: SessionKeyManagerConfig,
  options: SessionKeyComposableOptions = {},
): UseSessionKeysReturn {
  const manager = resolveManager(config, options);
  const sessions = shallowRef<SessionKeyInfo[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let generation = 0;
  let disposed = false;

  const refresh = async (): Promise<void> => {
    const own = ++generation;
    if (!toValue(connected)) {
      sessions.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const keys = await manager.listSessions();
      if (!disposed && own === generation) sessions.value = keys;
    } catch (cause) {
      if (!disposed && own === generation) {
        error.value =
          cause instanceof Error
            ? cause
            : new Error("Failed to load session keys");
      }
    } finally {
      if (!disposed && own === generation) loading.value = false;
    }
  };

  watch(
    () => toValue(connected),
    () => {
      void refresh();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    disposed = true;
    generation++;
  });

  return {
    sessions,
    activeSessions: computed(() =>
      sessions.value.filter((s) => s.status === "active"),
    ),
    loading,
    error,
    refresh,
    clearError: () => {
      error.value = null;
    },
    storageAvailable: manager.isStorageAvailable(),
    checkRailGrant: checkSessionKeyRailGrant,
  };
}

// ─── useCreateSessionKey ─────────────────────────────────────────────

export interface UseCreateSessionKeyReturn {
  createSessionKey: (
    scope?: Partial<SessionKeyScope>,
    signerAddress?: `0x${string}`,
  ) => Promise<SessionKeyInfo>;
  lastCreated: ShallowRef<SessionKeyInfo | null>;
  isCreating: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

export function useCreateSessionKey(
  config?: SessionKeyManagerConfig,
  options: SessionKeyComposableOptions = {},
): UseCreateSessionKeyReturn {
  const manager = resolveManager(config, options);
  const guard = useActionGuard();
  const lastCreated = shallowRef<SessionKeyInfo | null>(null);
  return {
    createSessionKey: (scope, signerAddress) =>
      guard.run(async () => {
        const info = await manager.createSessionKey(scope, signerAddress);
        lastCreated.value = info;
        return info;
      }, "Failed to create session key"),
    lastCreated,
    isCreating: guard.busy,
    error: guard.error,
    clearError: guard.reset,
  };
}

// ─── useRevokeSession ────────────────────────────────────────────────

export interface UseRevokeSessionReturn {
  revokeSession: (sessionId: string) => Promise<void>;
  isRevoking: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

/** Revocation is device-local: a bundle already handed out cannot be recalled. */
export function useRevokeSession(
  config?: SessionKeyManagerConfig,
  options: SessionKeyComposableOptions = {},
): UseRevokeSessionReturn {
  const manager = resolveManager(config, options);
  const guard = useActionGuard();
  return {
    revokeSession: (sessionId) =>
      guard.run(
        () => manager.revokeSession(sessionId),
        "Failed to revoke session key",
      ),
    isRevoking: guard.busy,
    error: guard.error,
    clearError: guard.reset,
  };
}

// ─── useSendWithSession ──────────────────────────────────────────────

export interface UseSendWithSessionReturn {
  checkScope: (
    sessionId: string,
    tx: SessionKeyTransaction,
  ) => Promise<ScopeCheckResult>;
  isBusy: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

export function useSendWithSession(
  config?: SessionKeyManagerConfig,
  options: SessionKeyComposableOptions = {},
): UseSendWithSessionReturn {
  const manager = resolveManager(config, options);
  const guard = useActionGuard();
  return {
    checkScope: (sessionId, tx) =>
      guard.run(
        () => manager.checkSessionScope(sessionId, tx),
        "Failed to check session scope",
      ),
    isBusy: guard.busy,
    error: guard.error,
    clearError: guard.reset,
  };
}
