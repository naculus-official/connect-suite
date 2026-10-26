import type React from 'react'
import { createContext, useContext, useMemo } from 'react'

// ── Business components ──────────────────────────────────
import { ConnectButton as BizConnectButton } from '../components/ConnectButton'
import { AccountButton as BizAccountButton } from '../components/AccountButton'
import { ChainSelector as BizChainSelector } from '../components/ChainSelector'
import { QRCodeModal as BizQRCodeModal } from '../components/QRCodeModal'
import { SignInButton as BizSignInButton } from '../components/SignInButton'
import { SeedPhraseBackup as BizSeedPhraseBackup } from '../components/SeedPhraseBackup'
import { ErrorBoundary as BizErrorBoundary } from '../components/ErrorBoundary'
import { Web3ConnectUI as BizWeb3ConnectUI } from '../components/Web3ConnectUI'
import { NativeButton } from '../lib/registry-fallbacks'

export interface ComponentRegistry {
  // ── Layer 1: Base UI (from shadcn or WC) ────────────────────────
  Button?: React.ComponentType<any>
  Card?: React.ComponentType<any>
  Badge?: React.ComponentType<any>
  Switch?: React.ComponentType<any>
  Checkbox?: React.ComponentType<any>
  Tabs?: React.ComponentType<any>
  TabsContent?: React.ComponentType<any>
  TabsList?: React.ComponentType<any>
  TabsTrigger?: React.ComponentType<any>
  DropdownMenu?: React.ComponentType<any>
  Avatar?: React.ComponentType<any>
  Skeleton?: React.ComponentType<any>
  Tooltip?: React.ComponentType<any>
  Popover?: React.ComponentType<any>
  Progress?: React.ComponentType<any>
  Separator?: React.ComponentType<any>
  ScrollArea?: React.ComponentType<any>
  Input?: React.ComponentType<any>
  Select?: React.ComponentType<any>
  Label?: React.ComponentType<any>
  Sheet?: React.ComponentType<any>
  Modal?: React.ComponentType<any>
  Dialog?: React.ComponentType<any>
  DialogContent?: React.ComponentType<any>
  DialogHeader?: React.ComponentType<any>
  DialogTitle?: React.ComponentType<any>

  // ── Layer 2: Business ──────────────────────────────────────────
  ConnectButton?: React.ComponentType<any>
  AccountButton?: React.ComponentType<any>
  ChainSelector?: React.ComponentType<any>
  QRCodeModal?: React.ComponentType<any>
  SignInButton?: React.ComponentType<any>
  SeedPhraseBackup?: React.ComponentType<any>
  ErrorBoundary?: React.ComponentType<any>
  AppKit?: React.ComponentType<any>
  AppKitButton?: React.ComponentType<any>
  AppKitChainSelector?: React.ComponentType<any>
  Web3ConnectUI?: React.ComponentType<any>
}

/**
 * Safe base control for the standalone AppKit build. Consumers can still
 * replace it with their design-system button through Web3ComponentProvider.
 */
export const DEFAULT_COMPONENTS: ComponentRegistry = {
  Button: NativeButton,
  // Business defaults
  ConnectButton: BizConnectButton,
  AccountButton: BizAccountButton,
  ChainSelector: BizChainSelector,
  QRCodeModal: BizQRCodeModal,
  SignInButton: BizSignInButton,
  SeedPhraseBackup: BizSeedPhraseBackup,
  ErrorBoundary: BizErrorBoundary,
  Web3ConnectUI: BizWeb3ConnectUI,
}

const ComponentRegistryContext = createContext<ComponentRegistry>({})

export interface Web3ComponentProviderProps {
  children: React.ReactNode
  components?: ComponentRegistry
}

export function Web3ComponentProvider({
  children,
  components = {},
}: Web3ComponentProviderProps) {
  const value = useMemo(
    () => ({ ...DEFAULT_COMPONENTS, ...components }),
    [components]
  )
  return (
    <ComponentRegistryContext.Provider value={value}>
      {children}
    </ComponentRegistryContext.Provider>
  )
}

export function useComponentRegistry(): ComponentRegistry {
  return useContext(ComponentRegistryContext)
}

export function useComponent<K extends keyof ComponentRegistry>(
  name: K
): ComponentRegistry[K] | undefined {
  const registry = useComponentRegistry()
  return registry[name]
}
