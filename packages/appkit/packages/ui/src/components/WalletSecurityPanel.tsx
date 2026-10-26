"use client"

import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from "lucide-react"
import { useEmbeddedWallet } from "@naculus/connect-appkit-react"
import type {
  StorageSecurityFinding,
  StorageSecurityReport,
} from "@naculus/connect-appkit-react"
import { cn } from "../lib/cn"

export interface WalletSecurityPanelProps {
  className?: string
  /** Hide findings that cost no points. Off by default — the hot-wallet
   *  exposure is one of them, and it is the one users most need to read. */
  hideInformational?: boolean
}

const SEVERITY_ICON = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const

const SEVERITY_CLASS = {
  critical: "text-destructive",
  warning: "text-amber-600 dark:text-amber-500",
  info: "text-muted-foreground",
} as const

function scoreTone(score: number): string {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-500"
  if (score >= 70) return "text-amber-600 dark:text-amber-500"
  return "text-destructive"
}

function FindingRow({ finding }: { finding: StorageSecurityFinding }) {
  const Icon = SEVERITY_ICON[finding.severity] ?? Info
  return (
    <li className="flex gap-2.5 rounded-md border border-border px-3 py-2.5">
      <Icon size={16} className={cn("mt-0.5 shrink-0", SEVERITY_CLASS[finding.severity])} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{finding.title}</span>
          {finding.deduction > 0 && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              −{finding.deduction}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {finding.detail}
        </p>
        {finding.remedy && (
          <p className="text-xs leading-relaxed">
            <span className="font-medium">What helps: </span>
            <span className="text-muted-foreground">{finding.remedy}</span>
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * Shows how the embedded wallet is stored, as a score with the specific
 * reasons it is not higher.
 *
 * A tier from 1 to 4 tells a user where they stand and nothing about why or
 * what to do about it. Every point this panel removes is attached to the
 * sentence that explains it.
 *
 * Renders nothing when no embedded wallet exists — the storage backend is
 * chosen when the wallet is created, so there is nothing to assess before
 * then, and a warning about a wallet that does not exist is noise.
 */
export interface WalletSecurityPanelViewProps extends WalletSecurityPanelProps {
  report: StorageSecurityReport | null
}

/**
 * The presentation, separated from where the report comes from.
 *
 * Exported because Storybook and any consumer holding its own report are both
 * real second callers, and because every visual state here is otherwise only
 * reachable by arranging a wallet on disk to be in that state.
 */
export function WalletSecurityPanelView({
  className,
  hideInformational = false,
  report: securityReport,
}: WalletSecurityPanelViewProps) {
  if (!securityReport) return null

  const { score, level, findings, encrypted, backend, unlock } = securityReport
  const shown = hideInformational
    ? findings.filter((f) => f.deduction > 0)
    : findings
  const perfect = findings.every((f) => f.deduction === 0)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
        <ShieldCheck size={22} className={cn("shrink-0", scoreTone(score))} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-semibold tabular-nums", scoreTone(score))}>
              {score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Tier {level}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {backend === "localStorage" ? "localStorage" : "IndexedDB"}
            {encrypted ? " · encrypted" : " · not encrypted"}
            {unlock.sealedWith?.includes("prf") ? " · passkey" : ""}
          </span>
        </div>
      </div>

      {perfect ? (
        <p className="text-xs text-muted-foreground">
          Nothing is holding this score down.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {/* Said plainly, because a number with an invented authority behind
              it is worse than no number. */}
          Scored against this SDK&apos;s own published rubric, not an external
          standard. Each item below names the points it costs.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {shown.map((finding) => (
          <FindingRow key={finding.id} finding={finding} />
        ))}
      </ul>
    </div>
  )
}

/** Reads the report from the embedded wallet and renders it. */
export function WalletSecurityPanel(props: WalletSecurityPanelProps) {
  const { securityReport } = useEmbeddedWallet()
  return <WalletSecurityPanelView {...props} report={securityReport} />
}
