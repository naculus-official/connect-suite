"use client";

import type {
  ActiveSessionBundle,
  SessionManager,
  UniversalWalletSession,
} from "@naculus/connect-core";
import {
  createConnectorManager,
  createSessionManager,
  LocalStorageSessionStorage,
  logger,
  WalletError,
} from "@naculus/connect-core";
import { eip6963Connector } from "@naculus/connector-evm-injected";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { createClient, type Web3Client } from "../client";
import { runSiwxFlow } from "../core/siwx-flow";
import {
  initialWeb3State,
  web3Reducer,
  withRetry,
  withTimeout,
} from "@naculus/connect-appkit-core";
import type {
  WalletChain,
  Web3Actions,
  Web3ConnectConfig,
  Web3State,
} from "../types";
import { getDefaultChains } from "../utils/chains";

// ── Timeout Helper ────────────────────────────────────────────────

export interface Web3ContextValue extends Web3State, Web3Actions {
  isConnected: boolean;
  chains: WalletChain[];
  /** Client owned by this provider instance. */
  client: Web3Client;
  /** SessionManager instance for multi-chain session management */
  sessionManager: SessionManager | null;
}

export const Web3Context = createContext<Web3ContextValue | null>(null);

export interface Web3ConnectProviderProps {
  children: React.ReactNode;
  config: Web3ConnectConfig;
  autoConnect?: boolean;
}

export function Web3ConnectProvider({
  children,
  config,
  autoConnect = true,
}: Web3ConnectProviderProps) {
  const [state, dispatch] = useReducer(web3Reducer, initialWeb3State);

  const chains = useMemo(
    () => config.chains ?? getDefaultChains(),
    [config.chains],
  );

  const connectionTimeout = config.connectionTimeout ?? 30000;
  const maxRetries = config.maxRetries ?? 2;

  const storage = useMemo(
    () =>
      config.sessionStorage ??
      new LocalStorageSessionStorage(
        config.storageKey ?? "naculus_web3_session",
        config.encryptionKey,
      ),
    [config.sessionStorage, config.storageKey, config.encryptionKey],
  );

  const client = useMemo(() => {
    return createClient({
      projectId: config.projectId,
      metadata: config.metadata,
      enableEmbedded: config.enableEmbedded,
      embeddedConfig: config.embeddedConfig,
      enablePasskeys: config.enablePasskeys,
      enableSolana: config.enableSolana,
      solanaDefaultChain: config.solanaDefaultChain,
      walletConnect: config.walletConnect,
      solanaWallets: config.solanaWallets,
      injectedProviders: config.injectedProviders,
    });
  }, [
    config.projectId,
    config.metadata,
    config.enableEmbedded,
    config.embeddedConfig,
    config.enablePasskeys,
    config.enableSolana,
    config.solanaDefaultChain,
    config.walletConnect,
    config.solanaWallets,
    config.injectedProviders,
  ]);

  // ── SessionManager ───────────────────────────────────────────────

  const sessionManagerRef = useRef<SessionManager | null>(null);
  // EIP-1193 chain events and an imperative switch can arrive in the same
  // tick. Keep the external synchronization promise visible to switchChain so
  // it cannot observe the old SessionManager chain and incorrectly no-op.
  const pendingExternalChainSyncRef = useRef<Promise<void> | null>(null);

  const sessionManager = useMemo(() => {
    // Build a connector manager that shares the client's connectors
    const cm = createConnectorManager();
    for (const connector of [eip6963Connector, ...client.getAllConnectors()]) {
      cm.register(connector.id, connector);
    }

    // Build default RPC/currency configs from the configured chains
    const defaultRpcUrls: Record<string, string> = {};
    const defaultCurrencies: Record<
      string,
      { name: string; symbol: string; decimals: number }
    > = {};

    for (const chain of chains) {
      const caip2Id = chain.caip2;
      if (chain.rpcUrl) {
        defaultRpcUrls[caip2Id] = chain.rpcUrl;
      }
      if (chain.token) {
        defaultCurrencies[caip2Id] = {
          name: chain.name,
          symbol: chain.token,
          decimals: 18,
        };
      }
    }

    const sm = createSessionManager(cm, {
      autoRefreshFeeOnSwitch: config.autoRefreshFeeOnSwitch ?? true,
      defaultRpcUrls,
      defaultCurrencies,
      encryptionKey: config.encryptionKey,
    });

    sessionManagerRef.current = sm;
    return sm;
  }, [client, chains, config.autoRefreshFeeOnSwitch, config.encryptionKey]);

  // Sync SessionManager events to provider state
  useEffect(() => {
    const onConnected = (payload: { bundle: any }) => {
      const { walletSession } = payload.bundle;
      dispatch({ type: "SET_SESSION", payload: walletSession });

      const accounts: string[] = [];
      Object.values(walletSession.namespaces).forEach((ns: any) => {
        accounts.push(...ns.accounts);
      });
      dispatch({ type: "SET_ACCOUNTS", payload: accounts });
      dispatch({ type: "SET_CHAIN", payload: payload.bundle.activeChainId });
      dispatch({ type: "SET_STATUS", payload: "connected" });
    };

    const onDisconnected = () => {
      dispatch({ type: "RESET" });
    };

    const onChainChanged = (payload: { newChainId: string }) => {
      dispatch({ type: "SET_CHAIN", payload: payload.newChainId });
    };

    // The wallet narrowed the scope: re-read accounts and active chain from
    // the bundle rather than keeping what the wider session had.
    const onScopeChanged = (payload: { bundle: ActiveSessionBundle }) =>
      onConnected(payload);
    // The wallet ended the session (revoked, expired, or scope emptied).
    // Covers the persisted-session-cleared case for every connector,
    // replacing WalletConnect's connector-private onSessionExpiry.
    const onRevoked = () => {
      storage.clear();
      dispatch({ type: "RESET" });
    };

    sessionManager.on("sessionConnected", onConnected);
    sessionManager.on("sessionDisconnected", onDisconnected);
    sessionManager.on("chainChanged", onChainChanged);
    sessionManager.on("sessionScopeChanged", onScopeChanged);
    sessionManager.on("sessionRevoked", onRevoked);

    return () => {
      sessionManager.off("sessionConnected", onConnected);
      sessionManager.off("sessionDisconnected", onDisconnected);
      sessionManager.off("chainChanged", onChainChanged);
      sessionManager.off("sessionScopeChanged", onScopeChanged);
      sessionManager.off("sessionRevoked", onRevoked);
    };
  }, [sessionManager, storage]);

  useEffect(() => {
    const handler = () => {
      storage.clear();
      dispatch({ type: "RESET" });
    };
    client.connector.onSessionExpiry(handler);
  }, [client, storage]);

  const syncSessionManagerConnectors = useCallback(() => {
    for (const connector of [eip6963Connector, ...client.getAllConnectors()]) {
      sessionManager.registerConnector(connector);
    }
  }, [client, sessionManager]);

  const attachSession = useCallback(
    async (session: UniversalWalletSession) => {
      syncSessionManagerConnectors();
      const connector = [eip6963Connector, ...client.getAllConnectors()].find(
        (candidate) =>
          candidate.id === session.walletType ||
          candidate.kind === session.walletType,
      );
      if (connector && !session.connectorId) session.connectorId = connector.id;
      const chainId =
        session.namespaces.eip155?.chains?.[0] ??
        session.namespaces.solana?.chains?.[0] ??
        session.namespaces.xrpl?.chains?.[0];
      if (chainId) await sessionManager.attach(session, chainId);
    },
    [client, sessionManager, syncSessionManagerConnectors],
  );

  const updateStateFromSession = useCallback(
    (session: typeof state.session) => {
      dispatch({ type: "SET_SESSION", payload: session });

      if (session) {
        const accounts: string[] = [];
        Object.values(session.namespaces).forEach((ns) => {
          accounts.push(...ns.accounts);
        });
        dispatch({ type: "SET_ACCOUNTS", payload: accounts });

        const evmChain = session.namespaces.eip155?.chains?.[0];
        const solChain = session.namespaces.solana?.chains?.[0];
        const xrplChain = session.namespaces.xrpl?.chains?.[0];
        dispatch({
          type: "SET_CHAIN",
          payload: evmChain ?? solChain ?? xrplChain ?? null,
        });
      } else {
        dispatch({ type: "SET_ACCOUNTS", payload: [] });
        dispatch({ type: "SET_CHAIN", payload: null });
      }
    },
    [],
  );

  // Wallets can change accounts without a reconnect call, and every namespace
  // has its own way of saying so: EIP-1193 `accountsChanged`, Solana's
  // `accountChanged`, a WalletConnect session update. This used to subscribe by
  // reaching through `eip6963Connector.getDiscoveredWallets()` into the raw
  // provider, which meant it re-implemented the CAIP-10 re-keying the connector
  // already did and worked for exactly one wallet kind — a Solana or
  // WalletConnect account switch was never noticed at all.
  //
  // The connector reports it now, so this subscribes once, namespace-agnostic,
  // and only mirrors the session the connector has already updated.
  useEffect(() => {
    const session = state.session;
    const activeClient = client;
    if (!session || !activeClient?.onAccountsChanged) return;

    const unsubscribe = activeClient.onAccountsChanged(session, (accounts) => {
      if (accounts.length === 0) {
        // The wallet is no longer authorizing this dApp.
        void storage.clear().finally(() => dispatch({ type: "RESET" }));
        return;
      }
      updateStateFromSession(session);
      void storage.save(session);
    });

    return unsubscribe;
  }, [state.session, client, storage, updateStateFromSession]);

  // Chain switches made in the wallet. The connector re-keys the session's
  // accounts to the new chain; what only the provider can do is drive the
  // SessionManager's external-chain sync, which other operations await.
  useEffect(() => {
    const session = state.session;
    const activeClient = client;
    if (!session || !activeClient?.onChainChanged) return;

    return activeClient.onChainChanged(session, (chainId) => {
      updateStateFromSession(session);
      void storage.save(session);

      const syncExternalChain = (
        sessionManager as SessionManager & {
          syncExternalChain?: (nextChainId: string) => Promise<void>;
        }
      ).syncExternalChain;
      if (!syncExternalChain) return;

      const syncPromise = syncExternalChain
        .call(sessionManager, chainId)
        .catch((error) => {
          logger.warn("react/provider", "External chain sync error:", error);
        });
      pendingExternalChainSyncRef.current = syncPromise;
      void syncPromise.finally(() => {
        if (pendingExternalChainSyncRef.current === syncPromise) {
          pendingExternalChainSyncRef.current = null;
        }
      });
    });
  }, [state.session, client, storage, updateStateFromSession, sessionManager]);

  // ── SIWx post-connection helper ──────────────────────────────────
  // Run after any connect method succeeds.  Returns false if SIWx is
  // configured, required, and failed — the caller should abort without
  // setting status to "connected".
  // The sequence itself lives in core/siwx-flow so every binding shares it;
  // this only maps the outcome onto React state and storage.
  const runSiwx = useCallback(
    async (session: UniversalWalletSession | null): Promise<boolean> => {
      if (!config.siwx || !session) return true;
      dispatch({ type: "SET_STATUS", payload: "authenticating" });

      const outcome = await runSiwxFlow({
        session,
        siwx: config.siwx,
        signMessage: (s, args) => client.signMessage(s, args),
      });

      if (outcome.kind === "failed" && outcome.fatal) {
        await storage.clear();
        dispatch({ type: "RESET" });
        dispatch({ type: "SET_ERROR", payload: outcome.error });
        return false;
      }
      return true;
    },
    [config.siwx, client, storage],
  );

  const connect = useCallback(async (): Promise<void> => {
    dispatch({ type: "SET_STATUS", payload: "connecting" });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const session = await withTimeout(
        client.connect(),
        connectionTimeout,
        "Wallet connect",
      );
      await storage.save(session);
      updateStateFromSession(session);

      try {
        await attachSession(session);
      } catch (smError) {
        logger.warn("react/provider", "SessionManager sync error:", smError);
      }

      if (!(await runSiwx(session))) return;
      dispatch({ type: "SET_STATUS", payload: "connected" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed";
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error : new Error(message),
      });
      dispatch({ type: "SET_STATUS", payload: "disconnected" });
    }
  }, [
    client,
    storage,
    updateStateFromSession,
    connectionTimeout,
    runSiwx,
    attachSession,
  ]);

  const connectEmbedded = useCallback(async (): Promise<void> => {
    dispatch({ type: "SET_STATUS", payload: "connecting" });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const session = await client.connectEmbedded();
      await storage.save(session);
      updateStateFromSession(session);
      await attachSession(session);
      if (!(await runSiwx(session))) return;
      dispatch({ type: "SET_STATUS", payload: "connected" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Embedded wallet connection failed";
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error : new Error(message),
      });
      dispatch({ type: "SET_STATUS", payload: "disconnected" });
    }
  }, [client, storage, updateStateFromSession, runSiwx, attachSession]);

  const connectPasskeys = useCallback(async (): Promise<void> => {
    dispatch({ type: "SET_STATUS", payload: "connecting" });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const session = await client.connectPasskeys();
      await storage.save(session);
      updateStateFromSession(session);
      await attachSession(session);
      if (!(await runSiwx(session))) return;
      dispatch({ type: "SET_STATUS", payload: "connected" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Passkeys connection failed";
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error : new Error(message),
      });
      dispatch({ type: "SET_STATUS", payload: "disconnected" });
    }
  }, [client, storage, updateStateFromSession, runSiwx, attachSession]);

  const disconnect = useCallback(async () => {
    if (!state.session) {
      dispatch({ type: "RESET" });
      return;
    }

    try {
      await client.disconnect(state.session);
    } catch (error) {
      logger.error("react/provider", "Disconnect error:", error);
    }

    // Also disconnect via SessionManager
    try {
      const sm = sessionManagerRef.current;
      if (sm) {
        await sm.disconnect();
      }
    } catch (smError) {
      logger.warn(
        "react/provider",
        "SessionManager disconnect error:",
        smError,
      );
    }

    await storage.clear();
    dispatch({ type: "RESET" });
  }, [client, state.session, storage]);

  const connectInjected = useCallback(
    async (walletId?: string): Promise<void> => {
      dispatch({ type: "SET_STATUS", payload: "connecting" });
      dispatch({ type: "SET_ERROR", payload: null });

      try {
        const session = await withTimeout(
          client.connectInjected(walletId),
          connectionTimeout,
          "Injected wallet connect",
        );
        await storage.save(session);
        updateStateFromSession(session);

        try {
          await attachSession(session);
        } catch (smError) {
          logger.warn("react/provider", "SessionManager sync error:", smError);
        }

        if (!(await runSiwx(session))) return;
        dispatch({ type: "SET_STATUS", payload: "connected" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Connection failed";
        dispatch({
          type: "SET_ERROR",
          payload: error instanceof Error ? error : new Error(message),
        });
        dispatch({ type: "SET_STATUS", payload: "disconnected" });
      }
    },
    [
      client,
      storage,
      updateStateFromSession,
      connectionTimeout,
      runSiwx,
      attachSession,
    ],
  );

  const startPairing = useCallback(async () => {
    return client.startPairing();
  }, [client]);

  const cancelPairing = useCallback(() => {
    client.cancelPairing?.();
  }, [client]);

  const completePairing = useCallback(async () => {
    const session = await client.completePairing();
    await storage.save(session);
    updateStateFromSession(session);
    await attachSession(session);
    if (!(await runSiwx(session))) return session;
    dispatch({ type: "SET_STATUS", payload: "connected" });
    return session;
  }, [client, storage, updateStateFromSession, runSiwx, attachSession]);

  /**
   * SIWx on the reconnect path.
   *
   * Every other entry point runs `runSiwx` before reporting `connected`;
   * this one did not, and `autoConnect` makes it the path taken on every page
   * load. An application configured with `required: true` therefore had the
   * setting enforced once and bypassed on every refresh.
   *
   * Optional SIWx is left alone: prompting for a signature the application
   * said it can live without, on every reload, is the wrong trade.
   */
  const runSiwxOnReconnect = useCallback(
    async (session: UniversalWalletSession): Promise<boolean> => {
      const siwx = config.siwx;
      if (!siwx || siwx.required === false) return true;
      try {
        if (await siwx.hasValidSession?.()) return true;
      } catch (err) {
        // A session check that throws has not established a session. Fall
        // through and ask for a signature rather than assuming one.
        logger.warn("react/provider", "siwx.hasValidSession failed", err);
      }
      return runSiwx(session);
    },
    [config.siwx, runSiwx],
  );

  const reconnect = useCallback(async () => {
    const savedSession = await storage.load();
    if (!savedSession) {
      dispatch({ type: "SET_STATUS", payload: "disconnected" });
      return;
    }

    dispatch({ type: "SET_STATUS", payload: "reconnecting" });

    try {
      const session = await withRetry(() => client.reconnect(savedSession), {
        maxRetries,
        baseDelay: 1000,
        label: "reconnect",
      });
      updateStateFromSession(session);

      // Restore SessionManager from persistence
      try {
        const sm = sessionManagerRef.current;
        if (sm) {
          syncSessionManagerConnectors();
          await sm.restoreFromPersistence();
        }
      } catch (smError) {
        logger.warn("react/provider", "SessionManager restore error:", smError);
      }

      if (!(await runSiwxOnReconnect(session))) return;
      dispatch({ type: "SET_STATUS", payload: "connected" });
    } catch (error) {
      logger.error("react/provider", "Reconnect error:", error);
      await storage.clear();
      dispatch({ type: "SET_STATUS", payload: "disconnected" });
      dispatch({ type: "SET_SESSION", payload: null });
    }
  }, [
    client,
    storage,
    updateStateFromSession,
    maxRetries,
    syncSessionManagerConnectors,
    runSiwxOnReconnect,
  ]);

  const switchChain = useCallback(
    async (chainId: string) => {
      if (pendingExternalChainSyncRef.current) {
        await pendingExternalChainSyncRef.current;
      }
      const sm = sessionManagerRef.current;
      if (sm?.getActiveBundle()) {
        // Use SessionManager's switchChain which handles fee sync + events
        await sm.switchChain(chainId);
        updateStateFromSession(state.session);
        return;
      }

      // Fallback to direct connector switching (no SessionManager)
      if (!state.session) {
        throw new Error("No active session");
      }

      try {
        if (
          state.session.walletType === "eip6963" ||
          state.session.id?.startsWith("eip6963-")
        ) {
          await eip6963Connector.switchChain(state.session, chainId);
        } else if (
          state.session.walletType === "embedded" &&
          client.embeddedConnector
        ) {
          await client.embeddedConnector.switchChain?.(state.session, chainId);
        } else if (
          state.session.walletType === "passkeys" &&
          client.passkeysConnector
        ) {
          await client.passkeysConnector.switchChain?.(state.session, chainId);
        } else if (
          state.session.walletType === "solana" &&
          client.solanaConnector
        ) {
          await client.solanaConnector.switchChain?.(state.session, chainId);
        } else {
          await client.connector.switchChain(state.session, chainId);
        }
        updateStateFromSession(state.session);
      } catch (error) {
        throw new WalletError(
          "chain_unsupported",
          "Failed to switch chain",
          error,
        );
      }
    },
    [client, state.session, updateStateFromSession],
  );

  useEffect(() => {
    if (autoConnect) {
      reconnect();
    }
  }, [autoConnect, reconnect]);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);

  const value = useMemo<Web3ContextValue>(
    () => ({
      ...state,
      connect,
      connectEmbedded,
      connectPasskeys,
      disconnect,
      reconnect,
      switchChain,
      startPairing,
      completePairing,
      cancelPairing,
      connectInjected,
      clearError,
      isConnected: state.status === "connected",
      chains,
      client,
      sessionManager,
    }),
    [
      state,
      connect,
      connectEmbedded,
      connectPasskeys,
      disconnect,
      reconnect,
      switchChain,
      startPairing,
      completePairing,
      cancelPairing,
      connectInjected,
      clearError,
      chains,
      client,
      sessionManager,
    ],
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextValue {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3ConnectProvider");
  }
  return context;
}
