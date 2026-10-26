/**
 * useSIWxSession — Unified SIWx session management hook.
 *
 * Combines the sign-in flow with session persistence, expiry tracking,
 * and automatic restoration. Replaces the older useSiwxAuthSession.
 *
 * Provides:
 *  - signIn / signOut / refresh lifecycle
 *  - Auto-restore from storage on mount
 *  - isExpired / timeUntilExpiry query
 *  - Loading/error state
 */

import { siwxResultToSession } from "@naculus/connect-appkit-core";
import { logger } from "@naculus/connect-core";
import type { SiwxSession } from "@naculus/siwx";
import {
  checkSessionExpired,
  createLocalStorageSiwxSessionStorage,
} from "@naculus/siwx";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import type { UseSIWxLoginOptions } from "./useSIWxLogin";
import { useSIWxLogin } from "./useSIWxLogin";

// ── Constants ────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────

export interface UseSIWxSessionOptions {
  /** Storage key prefix (default: "naculus_") */
  storagePrefix?: string;
  /** Auto-restore session from storage on mount (default: true) */
  autoRestore?: boolean;
  /** Default chain ID when signing in (default: current chain from context) */
  defaultChainId?: string;
  /** Default session lifetime in seconds (default: 86400 = 24h) */
  defaultExpirySeconds?: number;
}

export interface UseSIWxSessionReturn {
  /** The current SIWx session, or null */
  session: SiwxSession | null;
  /** Whether a valid session exists */
  isAuthenticated: boolean;
  /** Whether we're still checking persisted auth on mount */
  isRestoring: boolean;
  /** Whether a sign-in is in progress */
  isSigningIn: boolean;
  /** Whether the current session has expired */
  isExpired: boolean;
  /** Milliseconds until session expires, or null */
  timeUntilExpiry: number | null;

  /** Sign in with optional overrides */
  signIn: (options?: UseSIWxLoginOptions) => Promise<SiwxSession>;
  /** Sign out: clears session from memory and storage */
  signOut: () => Promise<void>;
  /** Refresh the current session */
  refresh: () => Promise<SiwxSession>;

  /** Last error */
  error: Error | null;
  /** Clear the last error */
  clearError: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Random suffix for a session record ID.
 *
 * `Math.random` gave roughly 31 predictable bits. The signature, not this ID,
 * is what authenticates a SIWx session, so this was not an authentication
 * bypass — but an ID a consumer may key storage or a request on should not be
 * guessable, and the CSPRNG is already the convention everywhere else here.
 */
// ── Hook ─────────────────────────────────────────────────────────

export function useSIWxSession(
  options?: UseSIWxSessionOptions,
): UseSIWxSessionReturn {
  const {
    storagePrefix = "naculus_",
    autoRestore = true,
    defaultExpirySeconds = 86_400,
  } = options ?? {};

  const [session, setSession] = useState<SiwxSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(autoRestore);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { chainId: currentChainId } = useWeb3();
  const login = useSIWxLogin();
  const storageRef = useRef(
    createLocalStorageSiwxSessionStorage(`${storagePrefix}siwx_session`),
  );

  const clearError = useCallback(() => setError(null), []);

  // ── Restore from storage on mount ──────────────────────────────

  useEffect(() => {
    if (!autoRestore) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const storage = storageRef.current;
        const saved = await storage.get();

        if (cancelled) return;

        if (saved) {
          logger.info(
            "react/useSIWxSession",
            "Restored persisted SIWx session",
          );
          setSession(saved);
          setError(null);
        } else {
          // No valid session in storage
          setSession(null);
        }
      } catch (err) {
        logger.warn(
          "react/useSIWxSession",
          "Failed to restore SIWx session:",
          err,
        );
        setSession(null);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoRestore]);

  // ── Expiry refresh timer ───────────────────────────────────────

  useEffect(() => {
    if (!session?.expiresAt) return;

    const timeUntilExpiry = new Date(session.expiresAt).getTime() - Date.now();
    if (timeUntilExpiry <= 0) {
      // Already expired — clear session
      setSession(null);
      return;
    }

    // Schedule clearing when expired
    const timer = setTimeout(() => {
      setSession((prev) => {
        if (prev && prev.id === session.id) {
          return null;
        }
        return prev;
      });
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [session?.id, session?.expiresAt]);

  // ── Sign In ────────────────────────────────────────────────────

  const signIn = useCallback(
    async (signOptions?: UseSIWxLoginOptions): Promise<SiwxSession> => {
      setIsSigningIn(true);
      setError(null);

      try {
        // Merge default options with provided overrides
        const effectiveOptions: UseSIWxLoginOptions = {
          expirySeconds: defaultExpirySeconds,
          chainId: currentChainId ?? undefined,
          ...signOptions,
        };

        const result = await login.signIn(effectiveOptions);

        // Convert SiwxResult to SiwxSession
        const siwxSession = siwxResultToSession(result);

        // Persist to storage
        const storage = storageRef.current;
        await storage.set(siwxSession);

        setSession(siwxSession);
        setIsSigningIn(false);
        return siwxSession;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error("SIWx sign-in failed");
        setError(wrapped);
        setIsSigningIn(false);
        throw wrapped;
      }
    },
    [login, currentChainId, defaultExpirySeconds],
  );

  // ── Sign Out ───────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    try {
      const storage = storageRef.current;
      await storage.remove();
    } catch (err) {
      logger.warn("react/useSIWxSession", "Failed to clear session:", err);
    }
    setSession(null);
    setError(null);
  }, []);

  // ── Refresh ────────────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<SiwxSession> => {
    if (!session) {
      throw new Error("No active session to refresh");
    }

    setIsSigningIn(true);
    setError(null);

    try {
      // Re-sign with updated timestamps
      const result = await login.signIn({
        domain: session.domain,
        statement: session.message.statement ?? undefined,
        uri: session.message.uri,
        chainId: session.chainId,
        expirySeconds: defaultExpirySeconds,
        resources:
          session.message.resources.length > 0
            ? session.message.resources
            : undefined,
        requestId: session.message.requestId ?? undefined,
      });

      const refreshedSession: SiwxSession = {
        ...siwxResultToSession(result),
        id: session.id, // preserve the original session ID
        refreshedAt: new Date().toISOString(),
      };

      // Persist
      const storage = storageRef.current;
      await storage.set(refreshedSession);

      setSession(refreshedSession);
      setIsSigningIn(false);
      return refreshedSession;
    } catch (err) {
      const wrapped =
        err instanceof Error ? err : new Error("Session refresh failed");
      setError(wrapped);
      setIsSigningIn(false);
      throw wrapped;
    }
  }, [session, login, defaultExpirySeconds]);

  // ── Computed state ─────────────────────────────────────────────

  const isAuthenticated = session !== null && !checkSessionExpired(session);
  const expired = checkSessionExpired(session);
  const timeUntilExpiry = session?.expiresAt
    ? Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
    : null;

  return {
    session: isAuthenticated ? session : null,
    isAuthenticated,
    isRestoring,
    isSigningIn,
    isExpired: expired,
    timeUntilExpiry,

    signIn,
    signOut,
    refresh,

    error,
    clearError,
  };
}
