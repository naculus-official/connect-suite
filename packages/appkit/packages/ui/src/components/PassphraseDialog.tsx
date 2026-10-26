"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react"
import { usePassphraseGate } from "@naculus/connect-appkit-react"
import type { PassphraseRequest } from "@naculus/connect-appkit-react"
import { cn } from "../lib/cn"

/**
 * NIST SP 800-63B's floor for a user-chosen memorized secret. Not a number
 * invented here, and not a claim that eight characters is enough — the copy
 * below says what actually helps.
 */
const MIN_LENGTH = 8

/** Below this, a single word is the likely shape and worth saying something about. */
const SHORT_LENGTH = 12

export interface PassphraseDialogProps {
  className?: string
}

/**
 * Asks for the passphrase that encrypts the embedded wallet on this device.
 *
 * Renders only while something is actually blocked on the answer — a load or
 * a save inside the storage adapter — and nothing at all when the app supplies
 * its own `encryptionPassphrase` or has encryption off.
 */
export interface PassphraseDialogViewProps extends PassphraseDialogProps {
  request: PassphraseRequest | null
  submit: (passphrase: string) => void
  cancel: () => void
}

/**
 * The presentation, separated from the gate that drives it.
 *
 * Exported because reaching the retry and create states otherwise means
 * arranging an actual failed decrypt.
 */
export function PassphraseDialogView({
  className,
  request,
  submit,
  cancel,
}: PassphraseDialogViewProps) {
  const [value, setValue] = useState("")
  const [confirm, setConfirm] = useState("")
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isCreate = request?.intent === "create"

  // Cleared between prompts. Carrying a value across would re-offer a
  // passphrase that has just been rejected.
  useEffect(() => {
    if (!request) {
      setValue("")
      setConfirm("")
      setVisible(false)
      return
    }
    setValue("")
    setConfirm("")
    inputRef.current?.focus()
  }, [request])

  const tooShort = isCreate && value.length > 0 && value.length < MIN_LENGTH
  const mismatch = isCreate && confirm.length > 0 && confirm !== value
  const canSubmit = isCreate
    ? value.length >= MIN_LENGTH && confirm === value
    : value.length > 0

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      submit(value)
    },
    [canSubmit, submit, value],
  )

  if (!request) return null

  return (
    <div
      className="naculus-dialog-viewport fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={isCreate ? "Choose a passphrase" : "Unlock your wallet"}
        onSubmit={handleSubmit}
        className={cn(
          "naculus-dialog-surface flex w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg",
          className,
        )}
      >
        <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-card px-1 py-1">
          <KeyRound size={18} className="shrink-0 text-primary" />
          <h2 className="text-base font-semibold">
            {isCreate ? "Choose a passphrase" : "Unlock your wallet"}
          </h2>
        </div>

        {request.previousError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {request.previousError}
          </p>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          {isCreate
            ? "This encrypts your wallet on this device. Without it, anything that can run script on this page can read your keys."
            : "Your wallet is encrypted on this device. Enter the passphrase you chose to open it."}
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">
            {isCreate ? "Passphrase" : "Passphrase"}
          </span>
          <span className="relative flex items-center">
            <input
              ref={inputRef}
              type={visible ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete={isCreate ? "new-password" : "current-password"}
              // biome-ignore lint/a11y/noAutofocus: focus moves into the passphrase field of the dialog the user just opened
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              aria-label={visible ? "Hide passphrase" : "Show passphrase"}
              onClick={() => setVisible((v) => !v)}
              className="naculus-hit-target absolute right-2 text-muted-foreground hover:text-foreground"
            >
              {visible ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>

        {isCreate && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Type it again</span>
            <input
              type={visible ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}

        {tooShort && (
          <p role="alert" className="text-xs text-destructive">
            At least {MIN_LENGTH} characters.
          </p>
        )}
        {mismatch && (
          <p role="alert" className="text-xs text-destructive">
            These do not match.
          </p>
        )}

        {isCreate && !tooShort && value.length > 0 && value.length < SHORT_LENGTH && (
          <p className="text-xs text-muted-foreground">
            {/* Factual, and the advice that actually helps. No strength meter:
                a color computed from character classes rates "P@ssw0rd!"
                above four ordinary words, which is backwards. */}
            Short. Several ordinary words are far harder to guess than a short
            one with symbols in it.
          </p>
        )}

        {isCreate && (
          <p className="flex gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              If you forget this, nothing can open this copy of the wallet —
              not us, not your browser. Your recovery phrase is the only thing
              that gets it back.
            </span>
          </p>
        )}

        <div data-dialog-actions className="sticky bottom-0 z-10 -mx-5 flex min-h-14 justify-end gap-2 border-t border-border bg-card px-5 pb-[max(0rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => cancel()}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isCreate ? "Encrypt wallet" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Asks for the passphrase that encrypts the embedded wallet on this device.
 *
 * Renders only while a load or save inside the storage adapter is actually
 * blocked on the answer, and nothing at all when the app supplies its own
 * `encryptionPassphrase` or has encryption off.
 */
export function PassphraseDialog(props: PassphraseDialogProps) {
  const { request, submit, cancel } = usePassphraseGate()
  return (
    <PassphraseDialogView
      {...props}
      request={request}
      submit={submit}
      cancel={cancel}
    />
  )
}
