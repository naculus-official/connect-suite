import {
  isSiwxExpired,
  isSiwxNotBeforeValid,
} from "@naculus/connect-appkit-core";
import { LocalStorageAdapter, logger } from "@naculus/connect-core";
import type { SiwxResult } from "@naculus/siwx";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseSignInWithXOptions } from "./useSignInWithX";
import { useSignInWithX } from "./useSignInWithX";

// ── Types ────────────────────────────────────────────────────────

export interface UseSiwxAuthSessionOptions {
  /** Storage key prefix (default: "naculus_") */
  storagePrefix?: string;
  /** Auto-restore auth from storage on mount (default: true) */
  autoRestore?: boolean;
}

export interface UseSiwxAuthSessionReturn {
  /** Whether a valid SIWx auth session exists */
  isSignedIn: boolean;
  /** Whether we're still checking persisted auth on mount */
  isRestoring: boolean;
  /** The persisted SIWx result, or null if not signed in */
  siwxResult: SiwxResult | null;
  /** Whether a sign-in is in progress */
  isSigningIn: boolean;
  /** Last sign-in error */
  error: Error | null;
  /** Sign in with optional overrides. Persists result to storage on success. */
  signIn: (options?: UseSignInWithXOptions) => Promise<SiwxResult>;
  /** Sign out: clears persisted auth and resets state */
  signOut: () => void;
  /** Clear the last error */
  clearError: () => void;
}

// ── Constants ────────────────────────────────────────────────────

const SIWX_AUTH_KEY = "siwx_auth";

// ── Helpers ──────────────────────────────────────────────────────

function getStorage(prefix: string): LocalStorageAdapter {
  return new LocalStorageAdapter(prefix);
}

// ── Hook ─────────────────────────────────────────────────────────

export function useSiwxAuthSession(
  options?: UseSiwxAuthSessionOptions,
): UseSiwxAuthSessionReturn {
  const { storagePrefix = "naculus_", autoRestore = true } = options ?? {};

  const [siwxResult, setSiwxResult] = useState<SiwxResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(autoRestore);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use the generic SIWx hook for the underlying signing flow.
  const signInWithX = useSignInWithX();
  const storageRef = useRef(getStorage(storagePrefix));

  const clearError = useCallback(() => setError(null), []);

  // ── Restore persisted auth on mount ────────────────────────────

  useEffect(() => {
    if (!autoRestore) {
      setIsRestoring(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const storage = storageRef.current;
        const saved = await storage.get<SiwxResult>(SIWX_AUTH_KEY);

        if (cancelled) return;

        if (
          saved &&
          !isSiwxExpired(saved, new Date()) &&
          isSiwxNotBeforeValid(saved, new Date())
        ) {
          logger.info(
            "react/useSiwxAuthSession",
            "Restored persisted SIWx auth session",
          );
          setSiwxResult(saved);
          setError(null);
        } else if (saved) {
          // Expired or not-yet-valid — clean up stale entry
          logger.info(
            "react/useSiwxAuthSession",
            "Persisted SIWx auth expired, clearing",
          );
          await storage.remove(SIWX_AUTH_KEY);
        }
      } catch (err) {
        logger.warn(
          "react/useSiwxAuthSession",
          "Failed to restore SIWx auth:",
          err,
        );
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoRestore]);

  // ── Sign In ────────────────────────────────────────────────────

  const signIn = useCallback(
    async (signOptions?: UseSignInWithXOptions): Promise<SiwxResult> => {
      setIsSigningIn(true);
      setError(null);

      try {
        const result = await signInWithX.signIn(signOptions);

        // Persist to storage
        const storage = storageRef.current;
        await storage.set(SIWX_AUTH_KEY, result);

        setSiwxResult(result);
        setIsSigningIn(false);
        return result;
      } catch (err) {
        const wrapped =
          err instanceof Error ? err : new Error("SIWx sign-in failed");
        setError(wrapped);
        setIsSigningIn(false);
        throw wrapped;
      }
    },
    [signInWithX],
  );

  // ── Sign Out ───────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    try {
      const storage = storageRef.current;
      await storage.remove(SIWX_AUTH_KEY);
    } catch (err) {
      logger.warn(
        "react/useSiwxAuthSession",
        "Failed to clear SIWx auth:",
        err,
      );
    }
    setSiwxResult(null);
    setError(null);
  }, []);

  // ── Result ─────────────────────────────────────────────────────

  return {
    isSignedIn: siwxResult !== null,
    isRestoring,
    siwxResult,
    isSigningIn,
    error,
    signIn,
    signOut,
    clearError,
  };
}
