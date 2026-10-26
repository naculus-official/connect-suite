import type React from 'react'
import { createContext, useContext, useMemo } from 'react'
import { Web3ConnectProvider } from '@naculus/connect-appkit-react'
import type { Web3ConnectConfig } from '@naculus/connect-appkit-react'
import { Web3ComponentProvider } from '../contexts/ComponentRegistry'
import { WalletConnectProvider } from '../contexts/WalletConnectContext'
import { ThemeProvider, type ThemeOverride, type ThemePriority } from '../contexts/ThemeContext'
import { QRCodeModal } from './QRCodeModal'

export type DetectionMode = "auto" | "walletconnect" | "eip6963"

export interface DetectionContextValue {
  mode: DetectionMode
}

const DetectionContext = createContext<DetectionContextValue>({ mode: "walletconnect" })

export function useDetectionMode(): DetectionContextValue {
  return useContext(DetectionContext)
}

export interface Web3ConnectUIProps {
  config: Web3ConnectConfig
  children: React.ReactNode
  autoConnect?: boolean
  /** Wallet connection detection mode:
   * - "walletconnect" (default): Always use WalletConnect relay
   * - "eip6963": Only use browser-injected EIP-6963 wallets
   * - "auto": Auto-detect EIP-6963 wallets, fall back to WalletConnect
   */
  detectionMode?: DetectionMode
  /** Theme overrides for connect UI components */
  theme?: ThemeOverride
  /** Default dark mode */
  defaultDark?: boolean
  /**
   * Theme priority mode:
   * - "computed" (default): Respect developer's existing CSS variables (e.g. shadcn theme)
   * - "fallback": Always inject connect's theme variables
   */
  themePriority?: ThemePriority
}

export function Web3ConnectUI({
  config,
  children,
  autoConnect = false,
  detectionMode = 'walletconnect',
  theme,
  defaultDark = false,
  themePriority = 'computed',
}: Web3ConnectUIProps) {
  const detectionCtx = useMemo<DetectionContextValue>(() => ({ mode: detectionMode }), [detectionMode])

  const needsWalletConnect = detectionMode === 'walletconnect' || detectionMode === 'auto'

  return (
    <DetectionContext.Provider value={detectionCtx}>
      <ThemeProvider theme={theme} defaultDark={defaultDark} priority={themePriority}>
        <Web3ComponentProvider components={{ QRCodeModal }}>
          <Web3ConnectProvider config={config} autoConnect={autoConnect}>
            {needsWalletConnect ? (
              <WalletConnectProvider>
                {children}
              </WalletConnectProvider>
            ) : (
              children
            )}
          </Web3ConnectProvider>
        </Web3ComponentProvider>
      </ThemeProvider>
    </DetectionContext.Provider>
  )
}
