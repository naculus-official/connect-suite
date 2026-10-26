"use client"

import type React from "react"
import { useState, useCallback, useMemo } from "react"
import { AlertTriangle, Check, Copy, Download, Eye, EyeOff, SkipForward, ArrowLeft, ArrowRight, Shield, X } from "lucide-react"
import { useComponentRegistry } from "../contexts/ComponentRegistry"
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks"
import { DefaultDialog } from "../lib/ui-defaults"
import { cn } from "../lib/cn"

export interface SeedPhraseBackupProps {
  seedPhrase: string
  onConfirm: () => void
  onSkip?: () => void
  onExportPrivateKey?: () => string | null
  className?: string
  wordCount?: 12 | 24
  /** When true, render inline instead of in a dialog */
  inline?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type BackupStep = "reveal" | "confirm" | "done"

interface ConfirmWord {
  index: number
  correct: string
  options: string[]
}

/**
 * Unbiased index in [0, max) from the platform CSPRNG.
 *
 * Rejection sampling rather than `% max`, which skews toward low indices when
 * max does not divide the range evenly.
 */
function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % max
}

/**
 * Fisher-Yates over the platform CSPRNG.
 *
 * `Math.random` is seeded predictably and is not a security primitive. It does
 * not leak the phrase — the user already has it — but this file decides which
 * words a backup is verified against, and every other random draw in this
 * codebase (passkey challenges, SIWS nonces, storage IVs) already uses
 * `crypto.getRandomValues`. There is no reason for the seed-phrase path to be
 * the one exception.
 */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildConfirmWords(phrase: string, count: number = 3): ConfirmWord[] {
  const words = phrase.trim().split(/\s+/)
  const indices = shuffleArray(words.map((_, i) => i)).slice(0, Math.min(count, words.length))

  return indices.map((idx) => {
    const correct = words[idx]
    const others = words.filter((_, i) => i !== idx)
    const distractors = shuffleArray(others).slice(0, 3)
    const options = shuffleArray([correct, ...distractors])
    return { index: idx, correct, options }
  })
}

export function SeedPhraseBackup({
  seedPhrase,
  onConfirm,
  onSkip,
  onExportPrivateKey,
  className,
  wordCount,
  inline = false,
  open = true,
  onOpenChange,
}: SeedPhraseBackupProps) {
  const registry = useComponentRegistry()
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton
  const Dialog = registry.Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }> | undefined
  const DialogContent = registry.DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }> | undefined
  const DialogHeader = registry.DialogHeader as React.ComponentType<{ children: React.ReactNode }> | undefined
  const DialogTitle = registry.DialogTitle as React.ComponentType<{ children: React.ReactNode }> | undefined

  const [step, setStep] = useState<BackupStep>("reveal")
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmWords, setConfirmWords] = useState<ConfirmWord[]>(() => buildConfirmWords(seedPhrase, 3))
  const [selectedWords, setSelectedWords] = useState<Record<number, string>>({})
  const [confirmErrors, setConfirmErrors] = useState<number[]>([])
  const [showExportKey, setShowExportKey] = useState(false)
  const [exportedKey, setExportedKey] = useState<string | null>(null)

  const words = useMemo(() => seedPhrase.trim().split(/\s+/), [seedPhrase])
  const wordItems = useMemo(() => {
    const occurrences = new Map<string, number>()
    return words.map((word) => {
      const occurrence = occurrences.get(word) ?? 0
      occurrences.set(word, occurrence + 1)
      return { word, key: `${word}-${occurrence}` }
    })
  }, [words])

  const handleReveal = useCallback(() => setRevealed(true), [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(seedPhrase)
      setCopyFailed(false)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Saying nothing here is the dangerous option. A clipboard write can be
      // refused — an insecure context, a denied permission, Safari outside a
      // user gesture — and a user who sees no change reasonably assumes the
      // phrase reached their password manager. They would then be relying on
      // a backup that does not exist.
      setCopied(false)
      setCopyFailed(true)
    }
  }, [seedPhrase])

  const handleStartConfirm = useCallback(() => {
    setConfirmWords(buildConfirmWords(seedPhrase, 3))
    setSelectedWords({})
    setConfirmErrors([])
    setStep("confirm")
  }, [seedPhrase])

  const handleSelectWord = useCallback((wordIndex: number, word: string) => {
    setSelectedWords((prev) => ({ ...prev, [wordIndex]: word }))
    setConfirmErrors((prev) => prev.filter((i) => i !== wordIndex))
  }, [])

  const handleVerify = useCallback(() => {
    const errors: number[] = []
    for (const cw of confirmWords) {
      if (selectedWords[cw.index] !== cw.correct) {
        errors.push(cw.index)
      }
    }
    if (errors.length > 0) {
      setConfirmErrors(errors)
      return
    }
    setStep("done")
    onConfirm()
  }, [confirmWords, selectedWords, onConfirm])

  const handleSkip = useCallback(() => {
    onSkip?.()
  }, [onSkip])

  const handleExportKey = useCallback(() => {
    if (onExportPrivateKey) {
      const key = onExportPrivateKey()
      setExportedKey(key)
      setShowExportKey(true)
    }
  }, [onExportPrivateKey])

  const allConfirmedSelected = confirmWords.every((cw) => selectedWords[cw.index] !== undefined)

  const revealContent = (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Write down these words in order and store them somewhere safe. Never share them with anyone.
            If you lose your seed phrase, your funds cannot be recovered.
          </p>
        </div>
      </div>

      {!revealed ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <Shield size={40} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Click the button below to reveal your seed phrase. Make sure no one is watching your screen.
          </p>
          <Button onClick={handleReveal} variant="default">
            <Eye size={16} />
            Reveal Seed Phrase
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {wordItems.map(({ word, key }, i) => (
              <div
                key={key}
                className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm"
              >
                <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">
                  {i + 1}
                </span>
                <span className="font-mono font-medium">{word}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCopy} variant="outline" size="sm">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : copyFailed ? "Copy failed" : "Copy"}
            </Button>
            {onExportPrivateKey && (
              <Button onClick={handleExportKey} variant="outline" size="sm">
                <Download size={14} />
                Export Private Key
              </Button>
            )}
          </div>

          {copyFailed && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              This browser would not let the page write to your clipboard.
              Nothing was copied — select the words above and copy them
              yourself, or write them down.
            </p>
          )}

          {showExportKey && exportedKey && (
            <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
              <div className="flex items-center gap-2">
                <EyeOff size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Private Key (keep secret!)
                </span>
              </div>
              <p className="font-mono text-xs break-all select-all">{exportedKey}</p>
            </div>
          )}

          <div data-dialog-actions className="sticky bottom-0 z-10 -mx-1 flex min-h-14 flex-col gap-2 border-t border-border bg-card px-1 pb-[max(0rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-between">
            <Button onClick={handleStartConfirm} variant="default">
              I&apos;ve Saved It
              <ArrowRight size={16} />
            </Button>
            {onSkip && (
              <Button onClick={handleSkip} variant="ghost" size="sm">
                <SkipForward size={14} />
                Skip Backup
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )

  const confirmContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Verify your backup by selecting the correct word for each position.
      </p>

      {confirmWords.map((cw) => {
        const hasError = confirmErrors.includes(cw.index)
        return (
          <div key={cw.index} className="space-y-2">
            <p className={cn(
              "text-sm font-medium",
              hasError ? "text-destructive" : "text-foreground"
            )}>
              Word #{cw.index + 1}
              {hasError && <span className="ml-2 text-xs text-destructive">(incorrect)</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {cw.options.map((opt) => {
                const isSelected = selectedWords[cw.index] === opt
                return (
                  <button
                    type="button"
                    // A mnemonic may legitimately repeat a word (for example,
                    // "abandon"). Include the prompt index so React keys stay
                    // unique without changing the displayed choices.
                    key={`${cw.index}-${opt}`}
                    onClick={() => handleSelectWord(cw.index, opt)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-mono transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : hasError
                          ? "border-destructive/50 bg-destructive/5"
                          : "border-border bg-card hover:border-primary/50"
                    )}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div data-dialog-actions className="sticky bottom-0 z-10 -mx-1 flex min-h-14 flex-col gap-2 border-t border-border bg-card px-1 pb-[max(0rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-between">
        <Button
          onClick={handleVerify}
          variant="default"
          disabled={!allConfirmedSelected}
        >
          <Check size={16} />
          Verify & Confirm
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={() => setStep("reveal")}
            variant="ghost"
            size="sm"
          >
            <ArrowLeft size={14} />
            Back
          </Button>
          {onSkip && (
            <Button onClick={handleSkip} variant="ghost" size="sm">
              <SkipForward size={14} />
              Skip
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const doneContent = (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <Check size={24} className="text-green-600 dark:text-green-400" />
      </div>
      <p className="font-medium text-foreground">Backup Confirmed</p>
      <p className="text-sm text-muted-foreground">
        Your seed phrase has been backed up successfully.
      </p>
    </div>
  )

  const steps: Record<BackupStep, React.ReactNode> = {
    reveal: revealContent,
    confirm: confirmContent,
    done: doneContent,
  }

  const titles: Record<BackupStep, string> = {
    reveal: "Backup Seed Phrase",
    confirm: "Verify Backup",
    done: "Backup Complete",
  }

  const body = steps[step]
  const title = titles[step]

  if (inline) {
    return (
      <div className={cn("space-y-4", className)}>
        {step !== "done" && (
          <h3 className="text-lg font-semibold">{title}</h3>
        )}
        {body}
      </div>
    )
  }

  if (!open) return null

  if (Dialog && DialogContent) {
    return (
      <Dialog open={true} onOpenChange={(o: boolean) => { if (!o) onOpenChange?.(false); }}>
        <DialogContent className="naculus-dialog-surface flex w-full max-w-lg flex-col overflow-y-auto">
          {DialogHeader && DialogTitle ? (
            <><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><div className="mt-2 max-h-[55vh] overflow-y-auto">{body}</div></>
          ) : (
            <><div className="mb-3 text-lg font-semibold">{title}</div><div className="max-h-[55vh] overflow-y-auto">{body}</div></>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <DefaultDialog open={true} onClose={() => onOpenChange?.(false)} title={title}>
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex items-center justify-between bg-card px-1 py-1">
        <h2 className="text-lg font-semibold m-0">{title}</h2>
        {onOpenChange && (
          <button
            onClick={() => onOpenChange(false)}
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer border-none bg-transparent"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {body}
    </DefaultDialog>
  )
}
