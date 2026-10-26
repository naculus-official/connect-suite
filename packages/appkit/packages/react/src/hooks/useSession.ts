/**
 * useSession Hook
 *
 * Provides access to the complete session state from SessionManager,
 * including all active chain sessions, the active chain ID, and
 * connection status.
 *
 * @see SRS-009 §7.2
 */

import { useSyncExternalStore, useCallback } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import type { ChainSession, ActiveSessionBundle } from "@naculus/connect-core";

export interface UseSessionReturn {
  /** The raw wallet session (from the active bundle) */
  session: ActiveSessionBundle["walletSession"] | null;
  /** All chain sessions within the active bundle */
  chainSessions: ChainSession[];
  /** The currently active chain ID */
  activeChainId: string | null;
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** The connector/wallet type (e.g., "eip6963", "walletconnect") */
  connectorId: string | null;
}

function subscribeToSessionManager(
  sm: import("@naculus/connect-core").SessionManager | null,
  callback: () => void,
): () => void {
  if (!sm) return () => {};

  const handler = () => callback();
  sm.on("sessionConnected", handler);
  sm.on("sessionDisconnected", handler);
  sm.on("chainChanged", handler);
  // CAIP-25 lifecycle (connect-core >= 0.2.6): the wallet narrowed or
  // ended the session without the app asking.
  sm.on("sessionScopeChanged", handler);
  sm.on("sessionRevoked", handler);

  return () => {
    sm.off("sessionConnected", handler);
    sm.off("sessionDisconnected", handler);
    sm.off("chainChanged", handler);
    sm.off("sessionScopeChanged", handler);
    sm.off("sessionRevoked", handler);
  };
}

const EMPTY_SESSION: UseSessionReturn = Object.freeze({
  session: null,
  chainSessions: [],
  activeChainId: null,
  isConnected: false,
  connectorId: null,
}) as UseSessionReturn;

/**
 * Last snapshot handed to React, per SessionManager.
 *
 * useSyncExternalStore compares snapshots with Object.is and re-renders when
 * they differ, so returning a fresh object literal on every call meant the
 * comparison never succeeded: React re-rendered, called getSnapshot again, got
 * another new object, and threw "Maximum update depth exceeded". Any component
 * calling useSession() crashed on first render, which is also why this file
 * had no coverage — it had never actually run.
 *
 * The bundle is mutated in place rather than replaced, so identity alone is
 * not a usable signal; the derived fields are compared instead and a new
 * object is produced only when one of them actually changed.
 */
const snapshotCache = new WeakMap<object, UseSessionReturn>();

function sameChainSessions(a: ChainSession[], b: ChainSession[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function getSessionSnapshot(
  sm: import("@naculus/connect-core").SessionManager | null,
): UseSessionReturn {
  if (!sm) return EMPTY_SESSION;

  const bundle = sm.getActiveBundle();
  const previous = snapshotCache.get(sm as unknown as object);

  if (!bundle) {
    if (previous && previous.session === null) return previous;
    snapshotCache.set(sm as unknown as object, EMPTY_SESSION);
    return EMPTY_SESSION;
  }

  const chainSessions = Array.from(bundle.chainSessions.values());
  if (
    previous &&
    previous.session === bundle.walletSession &&
    previous.activeChainId === bundle.activeChainId &&
    sameChainSessions(previous.chainSessions, chainSessions)
  ) {
    return previous;
  }

  const next: UseSessionReturn = {
    session: bundle.walletSession,
    chainSessions,
    activeChainId: bundle.activeChainId,
    isConnected: true,
    connectorId: bundle.walletSession.walletType,
  };
  snapshotCache.set(sm as unknown as object, next);
  return next;
}

export function useSession(
  sessionManager?: import("@naculus/connect-core").SessionManager | null,
): UseSessionReturn {
  const web3 = useWeb3();
  const sm = sessionManager ?? web3.sessionManager ?? null;

  const subscribe = useCallback(
    (callback: () => void) => subscribeToSessionManager(sm, callback),
    [sm],
  );

  const getSnapshot = useCallback(() => getSessionSnapshot(sm), [sm]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
