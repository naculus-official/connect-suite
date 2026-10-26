"use client"

import type React from "react"
import { Wallet, AlertCircle } from "lucide-react"
import { cn } from "../lib/cn"
import { useComponentRegistry } from "../contexts/ComponentRegistry"
import type { DiscoveredWallet } from "../hooks/useEIP6963"

export interface WalletPickerProps {
  wallets: DiscoveredWallet[]
  onSelect: (wallet: DiscoveredWallet) => void
  loading?: boolean
  error?: string | null
}

export function WalletPicker({
  wallets,
  onSelect,
  loading = false,
  error = null,
}: WalletPickerProps) {
  const registry = useComponentRegistry()
  const Card = registry.Card as React.ComponentType<{ className?: string; children?: React.ReactNode }> | undefined

  const wrapper = (children: React.ReactNode) =>
    Card ? (
      <Card className="p-4">{children}</Card>
    ) : (
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4">{children}</div>
    )

  if (loading) {
    return wrapper(
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: three static loading placeholders, never reordered
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg animate-pulse">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="h-4 w-32 rounded bg-muted" />
          </div>
        ))}
        <p className="text-xs text-muted-foreground text-center m-0">Detecting wallets...</p>
      </div>
    )
  }

  if (error) {
    return wrapper(
      <div className="flex flex-col items-center gap-3 py-4">
        <AlertCircle size={24} className="text-destructive" />
        <p className="text-sm text-destructive m-0 font-medium">{error}</p>
      </div>
    )
  }

  if (wallets.length === 0) {
    return wrapper(
      <div className="flex flex-col items-center gap-3 py-6">
        <Wallet size={32} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground m-0 text-center">
          No wallets detected.
          <br />
          Install a browser wallet extension to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {wallets.map((wallet) => (
        <button
          key={wallet.id}
          type="button"
          onClick={() => onSelect(wallet)}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-lg",
            "border border-input bg-card hover:bg-accent hover:text-accent-foreground",
            "transition-all duration-200 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        >
          {wallet.icon ? (
            <img
              src={wallet.icon}
              alt={wallet.name}
              className="h-10 w-10 rounded-full object-cover shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none"
              }}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Wallet size={18} className="text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col items-start gap-0.5 text-left min-w-0">
            <span className="text-sm font-medium truncate w-full">{wallet.name}</span>
            <span className="text-xs text-muted-foreground truncate w-full">{wallet.rdns}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
