"use client"

import type React from "react"
import { useCallback, useState } from "react"
import { Fingerprint, Loader2, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react"
import { useEmbeddedWallet, useWeb3 } from "@naculus/connect-appkit-react"
import { cn } from "../lib/cn"

export interface PasskeySetupProps {
  className?: string
}

/**
 * Registers a passkey and puts the wallet's stored record under it.
 *
 * Two facts drive the whole of this component:
 *
 * PRF cannot be added to a credential after creation. A passkey registered
 * without it can never unlock anything, and the only route forward is
 * registering a new one — so the result of the attempt has to be reported
 * honestly rather than as a generic success.
 *
 * A passkey protects the local copy, not the wallet. The recovery phrase is
 * still the only backup that survives losing the device, and that has to be
 * said here, at the moment someone turns this on, rather than in a document
 * they will not read.
 */
export interface PasskeySetupViewProps extends PasskeySetupProps {
  /** Null when passkeys are not enabled on the client. */
  passkeys: {
    hasCredential?: () => boolean
    createPasskey: () => Promise<unknown>
  } | null
  unlock: UnlockSnapshot | undefined
  onRegistered?: () => Promise<void> | void
}

/**
 * What the unlock layer reports, which is what decides the copy shown.
 *
 * `prf` being absent is a different fact from it being `"unavailable"`, and
 * the component must not collapse them.
 */
export interface UnlockSnapshot {
  prf?: "unknown" | "available" | "unavailable" | "none"
  sealedWith?: string[] | null
}

/**
 * The presentation, separated from the client and wallet it reads.
 *
 * Exported because every state here — registered but unusable, registered but
 * unsealed, not yet checked — otherwise needs a real authenticator behaving a
 * particular way.
 */
export function PasskeySetupView({
  className,
  passkeys,
  unlock,
  onRegistered,
}: PasskeySetupViewProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justRegistered, setJustRegistered] = useState(false)

  const hasCredential = Boolean(passkeys?.hasCredential?.()) || justRegistered

  const register = useCallback(async () => {
    if (!passkeys) return
    setBusy(true)
    setError(null)
    try {
      await passkeys.createPasskey()
      setJustRegistered(true)
      // The record on disk was sealed before this credential existed and is
      // still passphrase-only. One save re-seals it under both, which is the
      // whole migration — a v2 write either lands or leaves the previous
      // record untouched.
      await onRegistered?.()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not register a passkey",
      )
    } finally {
      setBusy(false)
    }
  }, [passkeys, onRegistered])

  // Nothing to offer when passkeys are not enabled on the client.
  if (!passkeys) return null

  const sealed = unlock?.sealedWith?.includes("prf") ?? false

  let status: {
    tone: "good" | "warn" | "bad" | "neutral"
    icon: React.ReactNode
    title: string
    detail: string
  } | null = null

  if (hasCredential) {
    switch (unlock?.prf) {
      case "available":
        status = sealed
          ? {
              tone: "good",
              icon: <ShieldCheck size={16} />,
              title: "Your passkey unlocks this wallet",
              detail:
                "Opening it needs your fingerprint or face, not a value a script on this page can supply.",
            }
          : {
              tone: "warn",
              icon: <TriangleAlert size={16} />,
              title: "Registered, but not applied yet",
              detail:
                "This device can produce the key material. The next time the wallet is saved, the record is sealed under it.",
            }
        break
      case "unavailable":
        status = {
          tone: "bad",
          icon: <ShieldAlert size={16} />,
          title: "This passkey cannot unlock the wallet",
          detail:
            "The authenticator did not return the key material. Firefox does not implement the extension, and a passkey created before it was requested cannot have it added afterwards — a new one has to be registered on a browser that supports it.",
        }
        break
      default:
        // Configured but not yet exercised, or the platform cannot report.
        // Not the same as "no", and saying "no" here would tell someone their
        // device cannot do something it may well do.
        status = {
          tone: "neutral",
          icon: <Fingerprint size={16} />,
          title: "A passkey is registered",
          detail:
            "Whether it can unlock this wallet is not known until the wallet is opened once. It will be used if it works.",
        }
        break
    }
  }

  const TONE_CLASS = {
    good: "text-emerald-600 dark:text-emerald-500",
    warn: "text-amber-600 dark:text-amber-500",
    bad: "text-destructive",
    neutral: "text-muted-foreground",
  } as const

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {status ? (
        <div className="flex gap-2.5 rounded-md border border-border px-3 py-2.5">
          <span className={cn("mt-0.5 shrink-0", TONE_CLASS[status.tone])}>
            {status.icon}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium">{status.title}</span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {status.detail}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A passkey raises what it takes to read your stored keys from
            &ldquo;any script on this page&rdquo; to your fingerprint or face.
            The passphrase keeps working, so a broken or replaced authenticator
            does not cost you this copy.
          </p>
          <p className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              This protects the copy on this device. It does not back up your
              wallet — the recovery phrase is still the only thing that
              survives losing this device.
            </span>
          </p>
          <button
            type="button"
            onClick={register}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Fingerprint size={15} />
            )}
            {busy ? "Waiting for your device…" : "Protect with a passkey"}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Registers a passkey for the embedded wallet and re-seals its stored record.
 */
export function PasskeySetup(props: PasskeySetupProps) {
  const { client } = useWeb3()
  const { securityReport, hasWallet } = useEmbeddedWallet()
  const onRegistered = useCallback(async () => {
    const embedded = client?.embeddedConnector
    if (embedded && hasWallet) await embedded.save()
  }, [client, hasWallet])

  return (
    <PasskeySetupView
      {...props}
      passkeys={client?.passkeysConnector ?? null}
      unlock={securityReport?.unlock}
      onRegistered={onRegistered}
    />
  )
}
