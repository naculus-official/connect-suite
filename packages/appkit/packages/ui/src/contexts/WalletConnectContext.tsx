"use client";

import type React from "react";
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useWeb3 } from "@naculus/connect-appkit-react";

export type QRStatus = "idle" | "loading" | "ready" | "error" | "cancelled";

export interface WalletConnectState {
  qrUri: string | null;
  showQR: boolean;
  qrStatus: QRStatus;
  error: string | null;
}

export interface WalletConnectContextValue {
  state: WalletConnectState;
  connectWalletConnect: () => Promise<void>;
  cancelQR: () => void;
  retryQR: () => void;
}

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

export interface WalletConnectProviderProps {
  children: React.ReactNode;
}

export function WalletConnectProvider({ children }: WalletConnectProviderProps) {
  const web3 = useWeb3();
  
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrStatus, setQrStatus] = useState<QRStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * Identifies the current pairing attempt.
   *
   * startPairing/completePairing cannot be aborted, so cancelling only ever
   * meant "stop showing the QR". The awaited completePairing kept running and
   * its success handler then overwrote the cancelled state — a user who
   * pressed cancel and whose wallet approved a moment later ended up
   * connected, with the UI back at idle as if nothing had happened. Bumping
   * the attempt id makes every later write from a superseded attempt a no-op.
   */
  const attemptRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  const cancelQR = useCallback(() => {
    attemptRef.current += 1;
    // Ignoring later state updates is not enough on its own: the pairing
    // promise keeps running and the wallet can still approve. Tell the
    // connector to abandon it so a session that arrives anyway is torn down
    // rather than leaving the user connected to something they declined.
    web3.cancelPairing?.();
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setQrUri(null);
    setShowQR(false);
    setQrStatus("cancelled");
    setError(null);
  }, [web3]);

  const connectRef = useRef<() => Promise<void>>(undefined)
  connectRef.current = async () => {
    if (!web3.startPairing || !web3.completePairing) {
      setError("WalletConnect pairing not available")
      setQrStatus("error")
      return
    }
    const attempt = ++attemptRef.current;
    const isCurrent = () => attemptRef.current === attempt;

    setQrStatus("loading")
    setError(null)
    setShowQR(true)
    try {
      const uri = await web3.startPairing()
      if (!isCurrent()) return
      setQrUri(uri)
      setQrStatus("ready")
      try {
        await web3.completePairing()
        if (!isCurrent()) return
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          if (!isCurrent()) return
          setShowQR(false); setQrUri(null); setQrStatus("idle")
        }, 1000)
      } catch (err) {
        if (!isCurrent()) return
        setQrStatus("error")
        setError(err instanceof Error ? err.message : "Connection failed")
      }
    } catch (err) {
      if (!isCurrent()) return
      setQrStatus("error")
      setError(err instanceof Error ? err.message : "Failed to generate QR code")
    }
  }

  const connectWalletConnect = useCallback(async () => {
    await connectRef.current?.()
  }, [])

  const retryQR = useCallback(() => {
    setQrUri(null)
    setError(null)
    setQrStatus("loading")
    connectRef.current?.()
  }, [])

  const state = useMemo<WalletConnectState>(
    () => ({
      qrUri,
      showQR,
      qrStatus,
      error,
    }),
    [qrUri, showQR, qrStatus, error]
  );

  const value = useMemo<WalletConnectContextValue>(
    () => ({
      state,
      connectWalletConnect,
      cancelQR,
      retryQR,
    }),
    [state, connectWalletConnect, cancelQR, retryQR]
  );

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useWalletConnect(): WalletConnectContextValue {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error("useWalletConnect must be used within a WalletConnectProvider");
  }
  return context;
}

export function useWalletConnectOptional(): WalletConnectContextValue | null {
  return useContext(WalletConnectContext);
}
