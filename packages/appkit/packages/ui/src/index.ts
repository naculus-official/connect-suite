export { ConnectButton } from "./components/ConnectButton";
export type { ConnectButtonProps } from "./components/ConnectButton";

export { ChainSelector } from "./components/ChainSelector";
export type { ChainSelectorProps } from "./components/ChainSelector";

export { AccountButton } from "./components/AccountButton";
export type { AccountButtonProps } from "./components/AccountButton";

export { AccountSelector, AccountSelectorView } from "./components/AccountSelector";
export type {
  AccountSelectorProps,
  AccountSelectorViewProps,
} from "./components/AccountSelector";

export {
  WalletSecurityPanel,
  WalletSecurityPanelView,
} from "./components/WalletSecurityPanel";
export type {
  WalletSecurityPanelProps,
  WalletSecurityPanelViewProps,
} from "./components/WalletSecurityPanel";

export {
  PassphraseDialog,
  PassphraseDialogView,
} from "./components/PassphraseDialog";
export type {
  PassphraseDialogProps,
  PassphraseDialogViewProps,
} from "./components/PassphraseDialog";

export { PasskeySetup, PasskeySetupView } from "./components/PasskeySetup";
export type {
  PasskeySetupProps,
  PasskeySetupViewProps,
  UnlockSnapshot,
} from "./components/PasskeySetup";

export { useIsMobile } from "./hooks/useIsMobile";
export { useEIP6963 } from "./hooks/useEIP6963";
export type { DiscoveredWallet, UseEIP6963Result } from "./hooks/useEIP6963";

export { cn } from "./lib/cn";

export {
  Web3ComponentProvider,
  useComponentRegistry,
  useComponent,
} from "./contexts/ComponentRegistry";
export type {
  ComponentRegistry,
  Web3ComponentProviderProps,
} from "./contexts/ComponentRegistry";

export {
  ThemeProvider,
  useTheme,
  useThemeVariable,
} from "./contexts/ThemeContext";
export type {
  ThemeOverride,
  ThemeProviderProps,
  ThemePriority,
} from "./contexts/ThemeContext";

export {
  WalletConnectProvider,
  useWalletConnect,
  useWalletConnectOptional,
} from "./contexts/WalletConnectContext";
export type {
  WalletConnectState,
  WalletConnectContextValue,
  WalletConnectProviderProps,
  QRStatus,
} from "./contexts/WalletConnectContext";

export { QRCodeModal } from "./components/QRCodeModal";
export { ErrorBoundary } from "./components/ErrorBoundary";
export type { ErrorBoundaryProps } from "./components/ErrorBoundary";
export type { QRCodeModalProps, QRCodeModalStatus } from "./components/QRCodeModal";

// ── SIWx Sign-In Button ──────────────────────────────────────────
export { SignInButton } from "./components/SignInButton";
export type { SignInButtonProps } from "./components/SignInButton";

export { Web3ConnectUI, useDetectionMode } from "./components/Web3ConnectUI";
export type { Web3ConnectUIProps, DetectionMode } from "./components/Web3ConnectUI";

// ── Seed Phrase Backup ────────────────────────────────────────────
export { SeedPhraseBackup } from "./components/SeedPhraseBackup";
export type { SeedPhraseBackupProps } from "./components/SeedPhraseBackup";

// ── AppKit ────────────────────────────────────────────────────────
export { AppKit, useAppKit, AppKitButton, AppKitChainSelector } from "./components/AppKit";
export type { AppKitProps, AppKitContextValue, AppKitButtonProps, AppKitChainSelectorProps } from "./components/AppKit";

// ── RouteSelector (Phase 5.3 — Cross-Chain Routing UI) ─────────────
export { RouteSelector } from "./components/RouteSelector";
export type { RouteSelectorProps, TokenDisplay } from "./components/RouteSelector";

// ── Smart Wallet ───────────────────────────────────────────────────
export { SmartWalletToggle } from "./components/SmartWalletToggle";
export type { SmartWalletToggleProps } from "./components/SmartWalletToggle";

export { SmartWalletSettings } from "./components/SmartWalletSettings";
export type { SmartWalletSettingsProps, SmartWalletConfig, AccountType, PaymasterType, BundlerPreset } from "./components/SmartWalletSettings";

export { AddressWarningDialog } from "./components/AddressWarningDialog";
export type { AddressWarningDialogProps } from "./components/AddressWarningDialog";

export { WalletPicker } from "./components/WalletPicker";
export type { WalletPickerProps } from "./components/WalletPicker";

export { AuthorizationConsent } from "./components/AuthorizationConsent";
export type { AuthorizationConsentProps } from "./components/AuthorizationConsent";
export { AuthorizationList } from "./components/AuthorizationList";
export type { AuthorizationListProps } from "./components/AuthorizationList";
export { PaymentReceipt } from "./components/PaymentReceipt";
export type { PaymentReceiptProps } from "./components/PaymentReceipt";
