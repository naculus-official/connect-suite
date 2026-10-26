"use client"

import React from "react"
import { Shield, ShieldCheck, LoaderCircle, Settings, ChevronRight, AlertCircle, RotateCcw, CheckCircle2, Fuel, Zap, RefreshCw } from "lucide-react"
import { useComponentRegistry } from "../contexts/ComponentRegistry"
import { NativeBadge, NativeButton, NativeCard } from "../lib/registry-fallbacks"

export interface SmartWalletToggleProps {
  isDeployed?: boolean
  isDeploying?: boolean
  estimatedGas?: bigint
  error?: string | null
  onUpgrade?: () => void
  onShowSettings?: () => void
  onRetry?: () => void
}

function formatGas(gas: bigint): string {
  const eth = Number(gas) / 1e18
  return eth < 0.001 ? `~${eth.toFixed(6)} ETH` : `~${eth.toFixed(3)} ETH`
}

type ShadcnButton = React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>

export function SmartWalletToggle({
  isDeployed = false, isDeploying = false, estimatedGas,
  error = null, onUpgrade, onShowSettings, onRetry,
}: SmartWalletToggleProps) {
  const registry = useComponentRegistry()
  const Button = (registry.Button as ShadcnButton | undefined) ?? NativeButton
  const Card = (registry.Card as React.ComponentType<React.HTMLAttributes<HTMLDivElement>> | undefined) ?? NativeCard
  const Badge = (registry.Badge as React.ComponentType<React.HTMLAttributes<HTMLDivElement> & { variant?: string }> | undefined) ?? NativeBadge

  const settingsBtn = onShowSettings ? (
    <Button variant="outline" className="w-full" onClick={onShowSettings}>
      <Settings size={15} /> Advanced Settings <ChevronRight size={14} className="text-muted-foreground" />
    </Button>
  ) : null

  // ── Deployed ────────────────────────────────────
  if (isDeployed) {
    return (
      <Card className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
              <ShieldCheck size={22} className="text-green-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-foreground">Smart Wallet</span>
                <Badge variant="secondary" className="rounded-full bg-green-500/10 px-2 py-0 text-xs font-medium text-green-500">
                  <CheckCircle2 size={12} className="mr-0.5 inline" /> Deployed
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">Your wallet has been upgraded to a smart wallet</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[[Fuel, "Gas Sponsorship", "Enabled"] as const, [RefreshCw, "Recovery", "Enabled"] as const].map(([Icon, label, val]) => (
            <div key={label} className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {React.createElement(Icon as never, { size: 14 })}
                <span>{label}</span>
              </div>
              <div className="mt-1 text-sm font-medium text-foreground">{val}</div>
            </div>
          ))}
        </div>
        {onShowSettings && <div className="mt-4">{settingsBtn}</div>}
      </Card>
    )
  }

  // ── Deploying ────────────────────────────────────
  if (isDeploying) {
    return (
      <Card className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <LoaderCircle size={28} className="animate-spin text-primary" />
          </div>
          <h3 className="mb-1 text-base font-semibold text-foreground">Deploying Smart Wallet...</h3>
          <p className="mb-4 text-sm text-muted-foreground">Please wait, contract deployment may take a few seconds</p>
          <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-muted">
            <div className="h-full w-full animate-pulse rounded-full bg-primary" style={{ animationDuration: "1.5s" }} />
          </div>
        </div>
      </Card>
    )
  }

  // ── Error ────────────────────────────────────────
  if (error) {
    return (
      <Card className="w-full rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle size={18} className="text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-destructive">Deployment Failed</h4>
            <p className="mt-1 text-xs text-destructive/80 break-words">{error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={onRetry}>
                <RotateCcw size={13} /> Retry
              </Button>
            )}
          </div>
        </div>
        {onShowSettings && <div className="mt-3">{settingsBtn}</div>}
      </Card>
    )
  }

  // ── Not deployed ─────────────────────────────────
  return (
    <Card className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
          <Shield size={20} className="text-amber-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">Smart Wallet</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Not Upgraded</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">Upgrade to a smart wallet for more features</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Benefit icon={Zap} color="text-green-500" text="No ETH needed for transactions — pay gas with USDC/USDT" />
        <Benefit icon={Fuel} color="text-blue-500" text="Optional dApp sponsorship, zero-cost transactions" />
        <Benefit icon={ShieldCheck} color="text-purple-500" text="Secure recovery mechanism, no fear of losing keys" />
      </div>
      {onUpgrade && (
        <Button className="mt-4 w-full" onClick={onUpgrade}>
          Upgrade Now
          {estimatedGas !== undefined && <span className="ml-1 text-xs opacity-80">(Estimated gas fee: {formatGas(estimatedGas)})</span>}
        </Button>
      )}
      {onShowSettings && <>
        <div className="mt-4 mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><div className="h-px flex-1 bg-border" />
        </div>
        {settingsBtn}
      </>}
    </Card>
  )
}

function Benefit({ icon: Icon, color, text }: { icon: React.ComponentType<{ size: number; className?: string }>; color: string; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-foreground/80">
      <Icon size={14} className={`shrink-0 ${color}`} />
      <span>{text}</span>
    </div>
  )
}
