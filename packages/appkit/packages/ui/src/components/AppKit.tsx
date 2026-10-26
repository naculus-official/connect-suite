"use client";

import type { Web3ConnectConfig } from "@naculus/connect-appkit-react";
import {
  useAccount,
  useBalance,
  useChain,
  useDisconnect,
  useEmbeddedWallet,
  useWallet,
  useWeb3,
} from "@naculus/connect-appkit-react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as componentRegistry from "../contexts/ComponentRegistry";
import type { DiscoveredWallet } from "../hooks/useEIP6963";
import { useEIP6963 } from "../hooks/useEIP6963";
import { cn } from "../lib/cn";
import { ChainSelector } from "./ChainSelector";
import { ConnectButton } from "./ConnectButton";
import { SeedPhraseBackup } from "./SeedPhraseBackup";
import { Web3ConnectUI, type Web3ConnectUIProps } from "./Web3ConnectUI";

export interface AppKitProps {
  projectId: string;
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  enableEmbedded?: boolean;
  enablePasskeys?: boolean;
  /** Chain/RPC configuration forwarded to connect-appkit-react. */
  chains?: Web3ConnectConfig["chains"];
  /** Embedded wallet storage, signer and isolation configuration. */
  embeddedConfig?: Web3ConnectConfig["embeddedConfig"];
  /** Encrypts persisted connection metadata at rest (not a frontend secret). */
  encryptionKey?: Web3ConnectConfig["encryptionKey"];
  /** Optional SIWx authentication policy. */
  siwx?: Web3ConnectConfig["siwx"];
  children?: React.ReactNode;
  className?: string;
  autoConnect?: boolean;
  theme?: Web3ConnectUIProps["theme"];
  defaultDark?: boolean;
  themePriority?: Web3ConnectUIProps["themePriority"];
  detectionMode?: Web3ConnectUIProps["detectionMode"];
}

export interface AppKitContextValue {
  connect: () => void;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  balance: string | null;
  /** Null when the chain's native symbol is not known. Do not substitute one. */
  balanceSymbol: string | null;
  chainName: string | null;
  availableChains: Array<{ caip2: string; name: string; token?: string }>;
  switchChain: (chainId: string) => Promise<void>;
  wallets: DiscoveredWallet[];
  hasWallets: boolean;
  /** Embedded wallet backup state */
  backupPending: boolean;
  seedPhrase: string | null;
  confirmBackup: () => void;
  skipBackup: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AppKitContext = createContext<AppKitContextValue | null>(null);

export function useAppKit(): AppKitContextValue {
  const ctx = useContext(AppKitContext);
  if (!ctx) {
    throw new Error("useAppKit must be used within an <AppKit> component");
  }
  return ctx;
}

export function AppKit({
  projectId,
  metadata,
  enableEmbedded = false,
  enablePasskeys = false,
  chains,
  embeddedConfig,
  encryptionKey,
  siwx,
  children,
  className,
  autoConnect = false,
  theme,
  defaultDark = false,
  themePriority = "computed",
  detectionMode = "auto",
}: AppKitProps) {
  const [open, setOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const config = useMemo<Web3ConnectConfig>(
    () => ({
      projectId,
      metadata,
      enableEmbedded,
      enablePasskeys,
      chains,
      embeddedConfig,
      encryptionKey,
      siwx,
    }),
    [
      projectId,
      metadata,
      enableEmbedded,
      enablePasskeys,
      chains,
      embeddedConfig,
      encryptionKey,
      siwx,
    ],
  );

  return (
    <Web3ConnectUI
      config={config}
      autoConnect={autoConnect}
      detectionMode={detectionMode}
      theme={theme}
      defaultDark={defaultDark}
      themePriority={themePriority}
    >
      <AppKitInner
        className={className}
        open={open}
        setOpen={setOpen}
        backupOpen={backupOpen}
        setBackupOpen={setBackupOpen}
      >
        {children}
      </AppKitInner>
    </Web3ConnectUI>
  );
}

interface AppKitInnerProps {
  children: React.ReactNode;
  className?: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  backupOpen: boolean;
  setBackupOpen: (open: boolean) => void;
}

function AppKitInner({
  children,
  className,
  open,
  setOpen,
  backupOpen,
  setBackupOpen,
}: AppKitInnerProps) {
  const { isConnected, isConnecting } = useWallet();
  const { primaryAccount } = useAccount();
  const { currentChain, availableChains, switchChain } = useChain();
  const embedded = useEmbeddedWallet();
  const { disconnect } = useDisconnect();
  const { wallets, hasWallets } = useEIP6963();
  const { formatted: balanceRaw } = useBalance();
  const balance = balanceRaw ?? null;

  const handleDisconnect = useCallback(async () => {
    await disconnect();
  }, [disconnect]);

  const handleConfirmBackup = useCallback(() => {
    embedded.confirmBackup();
    setBackupOpen(false);
  }, [embedded, setBackupOpen]);

  const handleSkipBackup = useCallback(() => {
    // Dismissal must clear the one-shot seed phrase held by the hook. Keeping
    // it in the React tree after the dialog closes needlessly expands its
    // exposure to app code and browser extensions.
    embedded.confirmBackup();
    setBackupOpen(false);
  }, [embedded, setBackupOpen]);

  const handleExportPrivateKey = useCallback((): string | null => {
    return embedded.getPrivateKey();
  }, [embedded]);

  const value = useMemo<AppKitContextValue>(
    () => ({
      connect: () => setOpen(true),
      disconnect: handleDisconnect,
      isConnected,
      isConnecting,
      address: primaryAccount,
      balance,
      // No `?? "ETH"`: this sits beside the number, and labelling MATIC or
      // SOL as ether is a statement about what the user holds.
      balanceSymbol: currentChain?.token ?? null,
      chainName: currentChain?.name ?? null,
      availableChains: availableChains.map((c) => ({
        caip2: c.caip2,
        name: c.name,
        token: c.token,
      })),
      switchChain,
      wallets,
      hasWallets,
      backupPending: embedded.backupPending,
      seedPhrase: embedded.seedPhrase,
      confirmBackup: handleConfirmBackup,
      skipBackup: handleSkipBackup,
      open,
      setOpen,
    }),
    [
      isConnected,
      isConnecting,
      primaryAccount,
      balance,
      currentChain,
      availableChains,
      switchChain,
      wallets,
      hasWallets,
      embedded.backupPending,
      embedded.seedPhrase,
      handleConfirmBackup,
      handleSkipBackup,
      handleDisconnect,
      open,
      setOpen,
    ],
  );

  // Open backup dialog when embedded wallet generates a seed phrase
  useEffect(() => {
    if (embedded.seedPhrase && embedded.backupPending) {
      setBackupOpen(true);
    }
  }, [embedded.seedPhrase, embedded.backupPending, setBackupOpen]);

  return (
    <AppKitContext.Provider value={value}>
      {children}

      {embedded.seedPhrase && backupOpen && (
        <SeedPhraseBackup
          seedPhrase={embedded.seedPhrase}
          onConfirm={handleConfirmBackup}
          onSkip={handleSkipBackup}
          onExportPrivateKey={handleExportPrivateKey}
          open={backupOpen}
          onOpenChange={setBackupOpen}
        />
      )}
    </AppKitContext.Provider>
  );
}

// ── Convenience sub-components ──────────────────────────────────────

export interface AppKitButtonProps {
  className?: string;
}

export function AppKitButton({ className }: AppKitButtonProps) {
  const ctx = useAppKit();
  const { connectInjected } = useWeb3();
  const { primaryAccount } = useAccount();
  const { disconnect } = useDisconnect();

  // The Web Component emits the selected wallet id, but the previous adapter
  // left AppKitButton without an onConnect handler.  That made the injected
  // wallet rows look clickable while never reaching the provider.  Keep the
  // adapter generic and wire the public AppKit convenience button here.
  const handleConnect = useCallback(
    async (
      walletKind: "injected" | "walletconnect",
      closeModal: () => void,
      walletId?: string,
    ) => {
      if (walletKind !== "injected") return;
      await connectInjected(walletId);
      closeModal();
    },
    [connectInjected],
  );

  if (ctx.isConnected && primaryAccount) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <ChainSelector variant="minimal" />
        <ConnectButton
          isConnected={ctx.isConnected}
          address={primaryAccount}
          balance={ctx.balance}
          balanceSymbol={ctx.balanceSymbol ?? undefined}
          onDisconnect={disconnect}
          onConnect={handleConnect}
          className={className}
        />
      </div>
    );
  }

  return (
    <ConnectButton
      isConnected={ctx.isConnected}
      isConnecting={ctx.isConnecting}
      address={primaryAccount}
      balance={ctx.balance}
      balanceSymbol={ctx.balanceSymbol ?? undefined}
      onDisconnect={disconnect}
      onConnect={handleConnect}
      className={className}
    />
  );
}

export interface AppKitChainSelectorProps {
  className?: string;
  variant?: "dropdown" | "buttons" | "minimal";
}

export function AppKitChainSelector({
  className,
  variant = "dropdown",
}: AppKitChainSelectorProps) {
  return <ChainSelector className={className} variant={variant} />;
}

// Register AppKit business components after their module has initialized.
// ComponentRegistry intentionally does not import this module, which keeps
// ChainSelector's registry dependency acyclic in production bundles.
try {
  const defaults = componentRegistry.DEFAULT_COMPONENTS;
  if (defaults)
    Object.assign(defaults, { AppKit, AppKitButton, AppKitChainSelector });
} catch {
  // Test consumers may mock the registry module without its optional defaults.
}
