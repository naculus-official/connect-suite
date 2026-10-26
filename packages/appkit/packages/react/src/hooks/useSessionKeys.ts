"use client";

import {
  checkSessionKeyRailGrant,
  type Eip3009SessionKeyRail,
  getSharedSessionKeyManager,
  resetSharedSessionKeyManager,
  type SessionKeyRailGrantCheck,
} from "@naculus/connect-appkit-core";
import type {
  SessionKeyInfo,
  SessionKeyManagerConfig,
  SessionKeyScope,
} from "@naculus/connect-core";
import { type SessionKeyManager, WalletError } from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";

// The process-wide manager and its config guard live in appkit-core so the
// React hooks and the Vue composables share one instance and one policy.
export function getSessionKeyManagerForHooks(
  config?: SessionKeyManagerConfig,
): SessionKeyManager {
  return getSharedSessionKeyManager(config);
}

/** @internal test helper */
export function __resetSessionKeyManagerForTests(): void {
  resetSharedSessionKeyManager();
}

// ─── useSessionKeys ────────────────────────────────────────────────────

export interface UseSessionKeysReturn {
  /** All session keys (active, revoked, expired) */
  sessions: SessionKeyInfo[];
  /** Only active session keys */
  activeSessions: SessionKeyInfo[];
  /** Whether data is loading */
  loading: boolean;
  /** Error from last operation */
  error: Error | null;
  /** Refresh the session list from storage */
  refresh: () => Promise<void>;
  /** Clear any error */
  clearError: () => void;
  /** Whether the storage backend is available */
  storageAvailable: boolean;
  /** Fail-closed check for whether a stored scope grants EIP-3009 signing. */
  checkRailGrant: (
    scope: SessionKeyScope | null | undefined,
    rail: Eip3009SessionKeyRail,
  ) => SessionKeyRailGrantCheck;
}

/**
 * Hook to list and manage session keys.
 *
 * @example
 * ```tsx
 * const { sessions, activeSessions, refresh } = useSessionKeys();
 * ```
 */
export function useSessionKeys(
  config?: SessionKeyManagerConfig,
): UseSessionKeysReturn {
  const { session } = useWeb3();
  const [sessions, setSessions] = useState<SessionKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const clearError = useCallback(() => setError(null), []);

  const manager = getSessionKeyManagerForHooks(config);
  const storageAvailable = manager.isStorageAvailable();

  const refresh = useCallback(async () => {
    if (!session) {
      setSessions([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const keys = await manager.listSessions();
      if (mountedRef.current) {
        setSessions(keys);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(
          err instanceof Error ? err : new Error("Failed to load session keys"),
        );
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [session, manager]);

  // Load sessions on mount and on session change
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const activeSessions = sessions.filter((s) => s.status === "active");

  return {
    sessions,
    activeSessions,
    loading,
    error,
    refresh,
    clearError,
    storageAvailable,
    checkRailGrant: checkSessionKeyRailGrant,
  };
}

// ─── useCreateSessionKey ───────────────────────────────────────────────

export interface UseCreateSessionKeyReturn {
  /** Create a new session key */
  createSessionKey: (
    scope?: Partial<SessionKeyScope>,
    signerAddress?: `0x${string}`,
  ) => Promise<SessionKeyInfo>;
  /** The last created session key info */
  lastCreated: SessionKeyInfo | null;
  /** Whether creation is in progress */
  isCreating: boolean;
  /** Error from last creation */
  error: Error | null;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook to create new session keys.
 *
 * @example
 * ```tsx
 * const { createSessionKey, lastCreated, isCreating } = useCreateSessionKey();
 *
 * const handleCreate = async () => {
 *   const session = await createSessionKey({
 *     expiry: Math.floor(Date.now() / 1000) + 1800, // 30 min
 *     maxTotalValue: parseEther("0.1"),
 *   });
 * };
 * ```
 */
export function useCreateSessionKey(
  config?: SessionKeyManagerConfig,
): UseCreateSessionKeyReturn {
  const { session } = useWeb3();
  const [lastCreated, setLastCreated] = useState<SessionKeyInfo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const manager = getSessionKeyManagerForHooks(config);

  const createSessionKey = useCallback(
    async (
      scope?: Partial<SessionKeyScope>,
      signerAddress?: `0x${string}`,
    ): Promise<SessionKeyInfo> => {
      if (!session) {
        throw new WalletError("wallet_unavailable", "No active wallet session");
      }

      setIsCreating(true);
      setError(null);
      try {
        const resolvedSigner = signerAddress ?? undefined;
        const info = await manager.createSessionKey(scope, resolvedSigner);
        setLastCreated(info);
        return info;
      } catch (err) {
        const errorObj =
          err instanceof Error
            ? err
            : new Error("Failed to create session key");
        setError(errorObj);
        throw errorObj;
      } finally {
        setIsCreating(false);
      }
    },
    [session, manager],
  );

  return {
    createSessionKey,
    lastCreated,
    isCreating,
    error,
    clearError,
  };
}

// ─── useRevokeSession ──────────────────────────────────────────────────

export interface UseRevokeSessionReturn {
  /** Revoke a session key by ID */
  revokeSession: (sessionId: string) => Promise<void>;
  /** Whether revoking is in progress */
  isRevoking: boolean;
  /** Error from last operation */
  error: Error | null;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook to revoke a session key.
 *
 * @example
 * ```tsx
 * const { revokeSession, isRevoking } = useRevokeSession();
 * await revokeSession(sessionId);
 * ```
 */
export function useRevokeSession(
  config?: SessionKeyManagerConfig,
): UseRevokeSessionReturn {
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const manager = getSessionKeyManagerForHooks(config);

  const revokeSession = useCallback(
    async (sessionId: string): Promise<void> => {
      setIsRevoking(true);
      setError(null);
      try {
        await manager.revokeSession(sessionId);
      } catch (err) {
        const errorObj =
          err instanceof Error
            ? err
            : new Error("Failed to revoke session key");
        setError(errorObj);
        throw errorObj;
      } finally {
        setIsRevoking(false);
      }
    },
    [manager],
  );

  return {
    revokeSession,
    isRevoking,
    error,
    clearError,
  };
}

// ─── useSendWithSession ────────────────────────────────────────────────

export interface UseSendWithSessionReturn {
  /** Check if a transaction is within a session's scope */
  checkScope: (
    sessionId: string,
    tx: {
      to?: string;
      value?: string;
      data?: string;
      chainId?: number;
      gas?: string;
    },
  ) => Promise<{
    valid: boolean;
    reason?: string;
    remainingGas?: bigint;
    remainingValue?: bigint;
    remainingTxCount?: number;
  }>;
  /** Whether an operation is in progress */
  isBusy: boolean;
  /** Error from last operation */
  error: Error | null;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook to check a transaction against a session key's scope.
 *
 * @example
 * ```tsx
 * const { checkScope } = useSendWithSession();
 *
 * const check = await checkScope(sessionId, tx);
 * ```
 */
export function useSendWithSession(
  config?: SessionKeyManagerConfig,
): UseSendWithSessionReturn {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const manager = getSessionKeyManagerForHooks(config);

  const checkScope = useCallback(
    async (
      sessionId: string,
      tx: {
        to?: string;
        value?: string;
        data?: string;
        chainId?: number;
        gas?: string;
      },
    ) => {
      setIsBusy(true);
      setError(null);
      try {
        return await manager.checkSessionScope(sessionId, tx);
      } catch (err) {
        const errorObj =
          err instanceof Error
            ? err
            : new Error("Failed to check session scope");
        setError(errorObj);
        throw errorObj;
      } finally {
        setIsBusy(false);
      }
    },
    [manager],
  );

  return {
    checkScope,
    isBusy,
    error,
    clearError,
  };
}

/**
 * Reset the global session key manager (useful for testing / cleanup).
 */
export function resetSessionKeyManager(): void {
  resetSharedSessionKeyManager();
}
