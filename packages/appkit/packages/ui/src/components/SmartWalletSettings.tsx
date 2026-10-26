"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { ArrowLeft, Save, Shield, Users, KeyRound, Fuel, Wrench, Plus, X } from "lucide-react"
import { cn } from "../lib/cn"
import { useComponentRegistry } from "../contexts/ComponentRegistry"
import { NativeButton, NativeCard, NativeInput, NativeSeparator } from "../lib/registry-fallbacks"

export type AccountType = "simple" | "multi-sig" | "social-recovery"
export type PaymasterType = "self" | "sponsor" | "erc20" | "custom"
export type BundlerPreset = "pimlico" | "stackup" | "alchemy" | "custom"

export interface SmartWalletConfig {
  accountType: AccountType
  paymasterType: PaymasterType
  customPaymasterUrl: string
  bundlerPreset: BundlerPreset
  customBundlerUrl: string
  guardians: string[]
  threshold: number
}

export interface SmartWalletSettingsProps {
  currentConfig?: Partial<SmartWalletConfig>
  onSave?: (config: SmartWalletConfig) => void
  onBack?: () => void
}

const ACCOUNT_TYPE_OPTIONS: Array<{
  value: AccountType; label: string; description: string; icon: React.ReactNode
}> = [
  { value: "simple", label: "Single Sign (default)", description: "Single key control, simple and secure", icon: <Shield size={16} /> },
  { value: "multi-sig", label: "Multi-Sign (2-of-3)", description: "Requires multiple signers to authorize transactions", icon: <Users size={16} /> },
  { value: "social-recovery", label: "Social Recovery", description: "Set guardian accounts to help recover", icon: <KeyRound size={16} /> },
]

const PAYMASTER_OPTIONS: Array<{ value: PaymasterType; label: string; description: string }> = [
  { value: "self", label: "Pay Self (ETH)", description: "Pay gas fees with ETH" },
  { value: "sponsor", label: "Sponsored by dApp", description: "dApp covers your gas fees" },
  { value: "erc20", label: "Pay with USDC/USDT", description: "Use ERC-20 tokens for gas" },
  { value: "custom", label: "Custom Paymaster URL", description: "Use a custom paymaster service" },
]

const BUNDLER_OPTIONS: Array<{ value: BundlerPreset; label: string; description: string }> = [
  { value: "pimlico", label: "Pimlico", description: "High-performance bundler service" },
  { value: "stackup", label: "Stackup", description: "Decentralized bundler network" },
  { value: "alchemy", label: "Alchemy", description: "Alchemy AA infrastructure" },
  { value: "custom", label: "Custom Bundler URL", description: "Use custom bundler endpoint" },
]

function defaultConfig(): SmartWalletConfig {
  return {
    accountType: "simple", paymasterType: "self", customPaymasterUrl: "",
    bundlerPreset: "pimlico", customBundlerUrl: "",
    guardians: [], threshold: 2,
  }
}

type ShadcnButton = React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }>
type ShadcnInput = React.ComponentType<React.InputHTMLAttributes<HTMLInputElement> & { className?: string }>

export function SmartWalletSettings({ currentConfig, onSave, onBack }: SmartWalletSettingsProps) {
  const registry = useComponentRegistry()
  const Button = (registry.Button as ShadcnButton | undefined) ?? NativeButton
  const Input = (registry.Input as ShadcnInput | undefined) ?? NativeInput
  const Card = (registry.Card as React.ComponentType<React.HTMLAttributes<HTMLDivElement>> | undefined) ?? NativeCard
  const Separator = (registry.Separator as React.ComponentType<React.HTMLAttributes<HTMLDivElement>> | undefined) ?? NativeSeparator

  const [config, setConfig] = useState<SmartWalletConfig>({ ...defaultConfig(), ...currentConfig })
  const [newGuardian, setNewGuardian] = useState("")
  const [saved, setSaved] = useState(false)

  const radioStyle = (active: boolean) =>
    cn("flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-200",
      active ? "border-primary bg-primary/5" : "border-border hover:bg-accent")

  const sectionInputStyle =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-all duration-200"

  const handleSave = useCallback(() => {
    onSave?.(config)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [config, onSave])

  const handleAddGuardian = useCallback(() => {
    const addr = newGuardian.trim()
    if (!addr || config.guardians.includes(addr)) return
    setConfig((prev) => ({ ...prev, guardians: [...prev.guardians, addr] }))
    setNewGuardian("")
  }, [newGuardian, config.guardians])

  return (
    <Card className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={15} />
               Back
            </Button>
          )}
          <h2 className="text-lg font-semibold text-foreground">Smart Wallet Settings</h2>
        </div>
      </div>

      {/* Account Type */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Shield size={15} /> Verification Method
        </h3>
        <div className="space-y-2">
          {ACCOUNT_TYPE_OPTIONS.map((opt) => (
            <label key={opt.value} className={radioStyle(config.accountType === opt.value)}>
              <input type="radio" name="accountType" value={opt.value}
                checked={config.accountType === opt.value}
                onChange={() => setConfig((p) => ({ ...p, accountType: opt.value }))}
                className="h-4 w-4 text-primary accent-primary" />
              <div className="flex items-center gap-2 text-foreground">{opt.icon}</div>
              <div>
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Social Recovery */}
      {config.accountType === "social-recovery" && (
        <section className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <KeyRound size={14} /> Guardian Addresses
          </h4>
          <p className="mb-3 text-xs text-muted-foreground">
             Set at least one guardian to help recover your wallet if you lose your key
          </p>
          {config.guardians.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {config.guardians.map((addr) => (
                <div key={addr} className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-foreground">
                    {addr.slice(0, 8)}...{addr.slice(-6)}
                  </span>
                  <Button variant="ghost" size="icon"
                    onClick={() => setConfig((p) => ({ ...p, guardians: p.guardians.filter((g) => g !== addr) }))}>
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
               type="text" placeholder="Enter guardian address (0x...)" value={newGuardian}
              onChange={(e) => setNewGuardian(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddGuardian() } }}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddGuardian} disabled={!newGuardian.trim()}>
               <Plus size={14} /> Add
            </Button>
          </div>
        </section>
      )}

      {/* Multi-sig threshold */}
      {config.accountType === "multi-sig" && (
        <section className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Users size={14} /> Signing Threshold
          </h4>
          <p className="mb-3 text-xs text-muted-foreground">
             Set how many signers are needed to authorize a transaction
          </p>
          <div className="flex items-center gap-3">
            {[1, 2, 3].map((n) => (
              <label key={n} className={radioStyle(config.threshold === n)}>
                <input type="radio" name="threshold" value={n}
                  checked={config.threshold === n}
                  onChange={() => setConfig((p) => ({ ...p, threshold: n }))}
                  className="sr-only" />
                {n}-of-3
              </label>
            ))}
          </div>
        </section>
      )}

      <Separator className="my-4" />

      {/* Gas / Paymaster */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Fuel size={15} /> Gas Fees
        </h3>
        <div className="space-y-2">
          {PAYMASTER_OPTIONS.map((opt) => (
            <label key={opt.value} className={radioStyle(config.paymasterType === opt.value)}>
              <input type="radio" name="paymasterType" value={opt.value}
                checked={config.paymasterType === opt.value}
                onChange={() => setConfig((p) => ({ ...p, paymasterType: opt.value }))}
                className="h-4 w-4 text-primary accent-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
        {config.paymasterType === "custom" && (
          <div className="mt-3">
            <input type="text" placeholder="Custom Paymaster URL" value={config.customPaymasterUrl}
              onChange={(e) => setConfig((p) => ({ ...p, customPaymasterUrl: e.target.value }))}
              className={sectionInputStyle} />
          </div>
        )}
      </section>

      <Separator className="my-4" />

      {/* Bundler */}
      <section className="mb-6">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Wrench size={15} /> Bundler
        </h3>
        <div className="space-y-2">
          {BUNDLER_OPTIONS.map((opt) => (
            <label key={opt.value} className={radioStyle(config.bundlerPreset === opt.value)}>
              <input type="radio" name="bundlerPreset" value={opt.value}
                checked={config.bundlerPreset === opt.value}
                onChange={() => setConfig((p) => ({ ...p, bundlerPreset: opt.value }))}
                className="h-4 w-4 text-primary accent-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
        {config.bundlerPreset === "custom" && (
          <div className="mt-3">
            <input type="text" placeholder="Custom Bundler URL" value={config.customBundlerUrl}
              onChange={(e) => setConfig((p) => ({ ...p, customBundlerUrl: e.target.value }))}
              className={sectionInputStyle} />
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button className="flex-1" onClick={handleSave}>
          <Save size={15} />
          {saved ? "Saved ✓" : "Save Settings"}
        </Button>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft size={15} />
            ← Back to Simple Mode
          </Button>
        )}
      </div>
    </Card>
  )
}
