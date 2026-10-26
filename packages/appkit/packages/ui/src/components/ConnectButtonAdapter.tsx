"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { AppkitConnectButton } from "@naculus/connect-appkit-react"
import { useWalletConnectOptional } from "../contexts/WalletConnectContext"
import { useEIP6963 } from "../hooks/useEIP6963"
import { useIsMobile } from "../hooks/useIsMobile"

export interface ConnectButtonProps {
  className?: string
  isConnected?: boolean
  isConnecting?: boolean
  onConnect?: (walletKind: "injected" | "walletconnect", closeModal: () => void, walletId?: string) => void | Promise<void>
  onDisconnect?: () => void
  onMobileDeepLink?: () => void
  mobileWalletName?: string
  startPairing?: () => Promise<string>
  completePairing?: () => Promise<any>
  address?: string
  balance?: string | null
  balanceSymbol?: string
  tokenBalances?: Array<{ symbol: string; formatted: string | null; name?: string }>
  isBalanceLoading?: boolean
  explorerUrl?: string
  explorerLabel?: string
}

/**
 * React adapter that bridges hook ecosystem to the Stencil WC.
 */
export function ConnectButtonAdapter({
  className,
  isConnected: extConnected,
  isConnecting: extConnecting,
  onConnect,
  onDisconnect,
  onMobileDeepLink,
  mobileWalletName,
  startPairing,
  completePairing,
  address,
  balance,
  balanceSymbol,
  tokenBalances,
  isBalanceLoading,
  explorerUrl,
  explorerLabel,
}: ConnectButtonProps) {
  const wcCtx = useWalletConnectOptional()
  const { wallets } = useEIP6963()
  const isMobile = useIsMobile()
  const walletsJson = JSON.stringify(
    wallets.map(({ id, name, icon, rdns }) => ({ id, name, icon, rdns })),
  )

  const [qrUri, setQrUri] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const pairingRef = useRef({ aborted: false })

  const cancelPairing = useCallback(() => {
    pairingRef.current.aborted = true
    wcCtx?.cancelQR()
    setQrLoading(false)
    setQrUri(null)
    setQrError(null)
  }, [wcCtx])

  // Sync WC context to WC props
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the three wcCtx.state fields it reads; the context object identity changes more often
  useEffect(() => {
    if (!wcCtx) return
    const { qrStatus, qrUri: ctxUri, error: ctxErr } = wcCtx.state
    if (qrStatus === "loading") { setQrLoading(true); setQrUri(null); setQrError(null) }
    else if (qrStatus === "ready" && ctxUri) { setQrLoading(false); setQrUri(ctxUri); setQrError(null) }
    else if (qrStatus === "error") { setQrLoading(false); setQrError(ctxErr) }
    else if (qrStatus === "idle" || qrStatus === "cancelled") { setQrLoading(false); setQrUri(null); setQrError(null) }
  }, [wcCtx?.state?.qrStatus, wcCtx?.state?.qrUri, wcCtx?.state?.error])

  const emitConnect = useCallback((kind: string, walletId?: string) => {
    if (kind === "walletconnect") {
      if (wcCtx) { wcCtx.connectWalletConnect(); return }
      if (startPairing && completePairing) {
        setQrLoading(true); setQrError(null)
        pairingRef.current.aborted = false
        startPairing().then(uri => {
          if (pairingRef.current.aborted) return
          setQrUri(uri); setQrLoading(false)
          completePairing().then(() => {
            if (!pairingRef.current.aborted) setQrUri(null)
          }).catch(err => {
            if (!pairingRef.current.aborted) setQrError(err instanceof Error ? err.message : "Connection failed")
          })
        }).catch(err => {
          if (!pairingRef.current.aborted) { setQrLoading(false); setQrError(err instanceof Error ? err.message : "Connection failed") }
        })
        return
      }
    }
    onConnect?.(kind as any, () => {}, walletId)
  }, [wcCtx, startPairing, completePairing, onConnect])

  // balanceSymbol falls through as an empty string, never "ETH": the
  // component renders no unit rather than the wrong one when the chain's
  // native symbol is unknown.
  return (
    <div className={className}>
      <AppkitConnectButton
      connected={extConnected ?? false}
      connecting={extConnecting ?? false}
      address={address ?? ""}
      balance={balance ?? null}
      balanceSymbol={balanceSymbol ?? ""}
      isBalanceLoading={isBalanceLoading ?? false}
      tokenBalancesJson={JSON.stringify(tokenBalances ?? [])}
      explorerUrl={explorerUrl ?? ""}
      explorerLabel={explorerLabel ?? ""}
      walletsJson={walletsJson}
      isMobile={isMobile}
      mobileWalletName={mobileWalletName ?? ""}
      qrUri={qrUri}
      qrLoading={qrLoading}
      qrError={qrError}
      onAppkitConnect={(e: CustomEvent<{ kind: string; walletId?: string }>) => {
        emitConnect(e.detail.kind, e.detail.walletId)
      }}
      onAppkitDisconnect={() => onDisconnect?.()}
      onAppkitStartPairing={() => emitConnect("walletconnect")}
      onAppkitRetry={() => { pairingRef.current.aborted = true; setQrError(null); setQrUri(null); emitConnect("walletconnect") }}
      onAppkitCancelPairing={cancelPairing}
      onAppkitMobileDeepLink={() => onMobileDeepLink?.()}
      onAppkitCopyAddress={(e: CustomEvent<string>) => {
        navigator.clipboard?.writeText(e.detail).catch(() => {})
      }}
    />
    </div>
  )
}
