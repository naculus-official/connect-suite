"use client";

import type React from "react";
import { Wallet } from "lucide-react";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks";

export interface AccountButtonProps {
  className?: string;
  showAddress?: boolean;
  showBalance?: boolean;
  address?: string;
  balance?: string | null;
  balanceSymbol?: string;
  onConnect?: () => void;
}

function DefaultAvatar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
      {children}
    </div>
  );
}

export function AccountButton({
  className,
  showAddress = true,
  showBalance = false,
  address: externalAddress,
  balance: externalBalance,
  balanceSymbol,
  onConnect,
}: AccountButtonProps) {
  const registry = useComponentRegistry();
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton;

  if (!externalAddress) {
    return (
      <Button
        aria-label="Connect Wallet"
        onClick={onConnect}
        className={className}
      >
        <Wallet size={18} className="shrink-0" />
        Connect Wallet
      </Button>
    );
  }

  const address = externalAddress.includes(":")
    ? externalAddress.split(":").pop()!
    : externalAddress;

  const shortAddress = address.slice(0, 6) + "..." + address.slice(-4);

  // No `?? "ETH"`. The caller passes null when the chain's native symbol is
  // unknown, and substituting one here labels MATIC or SOL as ether in the
  // one place a user actually reads it. An amount with no unit is worse to
  // look at and better to trust.
  const formattedBalance = externalBalance !== null && externalBalance !== undefined
    ? parseFloat(externalBalance).toLocaleString(undefined, { maximumFractionDigits: 4 }) +
      (balanceSymbol ? ` ${balanceSymbol}` : "")
    : null;

  return (
    <Button className={className}>
      <DefaultAvatar>W</DefaultAvatar>
      <div className="flex flex-col items-start gap-0">
        {showAddress && (
          <span className="font-mono text-xs">{shortAddress}</span>
        )}
        {showBalance && formattedBalance && (
          <span className="text-xs text-muted-foreground">{formattedBalance}</span>
        )}
        {showBalance && !formattedBalance && externalBalance === null && (
          <span className="text-xs text-muted-foreground">Loading...</span>
        )}
      </div>
    </Button>
  );
}
