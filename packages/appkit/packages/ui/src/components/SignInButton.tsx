"use client"

import type React from "react"
import { useState } from "react"
import { LogIn, Loader2, CheckCircle2, AlertCircle, X, Copy, Check } from "lucide-react"
import { useComponentRegistry } from "../contexts/ComponentRegistry"
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks"
import type { SiwxResult } from "@naculus/siwx"

export interface SignInButtonProps {
  className?: string
  isSignedIn?: boolean
  isSigningIn?: boolean
  result?: SiwxResult | null
  error?: Error | null
  onSignIn?: () => void
  onClearError?: () => void
  children?: React.ReactNode
}

export function SignInButton({
  className,
  isSignedIn = false,
  isSigningIn = false,
  result = null,
  error = null,
  onSignIn,
  onClearError,
  children,
}: SignInButtonProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [copiedSign, setCopiedSign] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const registry = useComponentRegistry()
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton
  const Dialog = registry.Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }> | undefined
  const DialogContent = registry.DialogContent as React.ComponentType<{ children: React.ReactNode }> | undefined
  const DialogHeader = registry.DialogHeader as React.ComponentType<{ children: React.ReactNode }> | undefined
  const DialogTitle = registry.DialogTitle as React.ComponentType<{ children: React.ReactNode }> | undefined

  const handleCopySignature = async () => {
    if (result?.signature) {
      try {
        await navigator.clipboard.writeText(result.signature)
        setCopyFailed(false)
        setCopiedSign(true)
        setTimeout(() => setCopiedSign(false), 2000)
      } catch {
        // A refused clipboard write with no feedback reads as a dead button.
        setCopiedSign(false)
        setCopyFailed(true)
      }
    }
  }

  // Idle state
  if (!isSignedIn && !isSigningIn && !error) {
    return (
      <Button onClick={onSignIn} className={className} aria-label="Sign In">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <LogIn size={16} />
          {children ?? "Sign In"}
        </span>
      </Button>
    )
  }

  // Signing-in state
  if (isSigningIn) {
    return (
      <Button disabled className={className} aria-label="Signing In">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <Loader2 size={16} className="animate-spin" />
          Signing In...
        </span>
      </Button>
    )
  }

  // Error state
  if (error && !isSignedIn) {
    return (
      <div style={{ position: "relative", display: "inline-flex", flexDirection: "column" }}>
        <Button onClick={onSignIn} className={className} aria-label="Retry Sign In">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={16} style={{ color: "var(--destructive, #ef4444)" }} />
            {children ?? "Retry Sign In"}
          </span>
        </Button>
        <div style={{
          fontSize: "0.75rem", color: "var(--destructive, #ef4444)",
          padding: "0.25rem 0.5rem", borderRadius: "0.375rem",
          background: "var(--destructive-foreground, #fef2f2)",
          marginTop: "2px",
          wordBreak: "break-word",
          maxWidth: "100%",
          lineHeight: 1.4,
        }}>
          {error.message}
        </div>
      </div>
    )
  }

  // Signed-in state
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Button
        onClick={() => setShowDetails((prev) => !prev)}
        className={className}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Signed In</span>
        </span>
      </Button>

      {showDetails && (Dialog && DialogContent ? (
        <Dialog open={true} onOpenChange={(open: boolean) => { if (!open) setShowDetails(false); }}>
          <DialogContent>
            {DialogHeader && DialogTitle
              ? <><DialogHeader><DialogTitle>Sign-In Details</DialogTitle></DialogHeader><SignInDetails result={result} onClose={() => setShowDetails(false)} copiedSign={copiedSign} copyFailed={copyFailed} onCopy={handleCopySignature} /></>
              : <><div style={{ fontWeight: 600, fontSize: "1.125rem", marginBottom: "0.75rem" }}>Sign-In Details</div><SignInDetails result={result} onClose={() => setShowDetails(false)} copiedSign={copiedSign} copyFailed={copyFailed} onCopy={handleCopySignature} /></>
            }
          </DialogContent>
        </Dialog>
      ) : (
        showDetails && (
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
            width: "340px", maxWidth: "90vw",
            background: "var(--card, #fff)", border: "1px solid var(--border, #e2e8f0)",
            borderRadius: "0.75rem", boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
            padding: "1rem",
          }}>
            <SignInDetails result={result} onClose={() => setShowDetails(false)} copiedSign={copiedSign} copyFailed={copyFailed} onCopy={handleCopySignature} />
          </div>
        )
      ))}
    </div>
  )
}

function SignInDetails({
  result,
  onClose,
  copiedSign,
  onCopy,
  copyFailed,
}: {
  result: SiwxResult | null
  onClose: () => void
  copiedSign: boolean
  onCopy: () => void
  copyFailed?: boolean
}) {
  const registry = useComponentRegistry()
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton
  if (!result) {
    return (
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <CheckCircle2 size={32} style={{ color: "#22c55e", margin: "0 auto 0.75rem" }} />
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground, #64748b)" }}>
          Authenticated successfully
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    )
  }

  const { message: msg, signature } = result
  const shortSig = signature.length > 20
    ? signature.slice(0, 14) + "..." + signature.slice(-6)
    : signature

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CheckCircle2 size={18} color="#22c55e" />
          <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Signed In</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X size={16} /></Button>
      </div>

      {/* Domain and address */}
      <div style={{ display: "grid", gap: "0.375rem" }}>
        <div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Domain</span>
          <p style={{ fontSize: "0.8125rem", fontFamily: "monospace", marginTop: "0.125rem" }}>{msg.domain}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Address</span>
          <p style={{ fontSize: "0.8125rem", fontFamily: "monospace", marginTop: "0.125rem", wordBreak: "break-all" }}>{msg.address}</p>
        </div>
        <div>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Chain</span>
          <p style={{ fontSize: "0.8125rem", fontFamily: "monospace", marginTop: "0.125rem" }}>{msg.chainId}</p>
        </div>
      </div>

      {/* Statement */}
      {msg.statement && (
        <div style={{ padding: "0.5rem 0.625rem", borderRadius: "0.375rem",
          background: "var(--muted, #f1f5f9)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
          {msg.statement}
        </div>
      )}

      {/* Signature */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Signature</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCopy}
            title={
              copyFailed
                ? "This browser refused the clipboard — select the signature and copy it"
                : "Copy signature"
            }
            aria-label={copyFailed ? "Copy failed" : "Copy signature"}
          >
            {copiedSign ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
          </Button>
        </div>
        <p style={{ fontSize: "0.75rem", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.4,
          color: "var(--muted-foreground, #64748b)", background: "var(--muted, #f1f5f9)", padding: "0.375rem 0.5rem",
          borderRadius: "0.375rem" }}>
          {shortSig}
        </p>
      </div>

      <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
    </div>
  )
}
