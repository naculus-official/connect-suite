"use client";

import type {
  PaymentRecord,
  AuthorizationAssetMetadata,
} from "@naculus/connect-appkit-core";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  ShieldQuestion,
} from "lucide-react";
import type React from "react";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { NativeBadge, NativeCard } from "../lib/registry-fallbacks";
import { cn } from "../lib/cn";
import { Address, formatBaseAmount, tone } from "./payment-ui";

export interface PaymentReceiptProps {
  record: PaymentRecord;
  assets?: Record<string, AuthorizationAssetMetadata>;
  explorerUrl?: (record: PaymentRecord) => string | undefined;
  className?: string;
}

const copy = {
  unverified: ["Unverified", "Reported by the server, not yet checked."],
  pending: ["Checking", "Checking on chain."],
  verified: ["Verified", "Verified on chain."],
  mismatch: [
    "Mismatch",
    "The on-chain settlement does not match this payment.",
  ],
  failed: ["Verification failed", "The settlement could not be verified."],
  unavailable: [
    "Verification unavailable",
    "On-chain checking is unavailable. Retry later.",
  ],
} as const;

export function PaymentReceipt({
  record,
  assets = {},
  explorerUrl,
  className,
}: PaymentReceiptProps) {
  const registry = useComponentRegistry();
  const Card =
    (registry.Card as
      | React.ComponentType<React.HTMLAttributes<HTMLDivElement>>
      | undefined) ?? NativeCard;
  const Badge =
    (registry.Badge as
      | React.ComponentType<React.HTMLAttributes<HTMLSpanElement>>
      | undefined) ?? NativeBadge;
  const status = record.verification.status;
  const verified = status === "verified";
  const error = status === "mismatch" || status === "failed";
  const Icon = verified
    ? CheckCircle2
    : status === "pending"
      ? LoaderCircle
      : error
        ? AlertCircle
        : ShieldQuestion;
  const link = explorerUrl?.(record);

  return (
    <Card
      data-verification={status}
      className={cn(
        // h-full + flex column: receipts placed side by side stretch to one
        // height instead of each following its own verification text.
        "naculus-payment-surface mx-auto flex h-full w-full max-w-lg min-w-0 flex-col overflow-hidden p-5",
        className,
      )}
    >
      <header className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment receipt
        </p>
        <h2 className="mt-2 break-words text-3xl font-semibold tabular-nums">
          {formatBaseAmount(record.amount, record.asset, assets)}
        </h2>
        <p className="mt-1 break-all text-sm text-muted-foreground">
          {record.asset
            ? (assets[record.asset]?.symbol ?? record.asset)
            : "Asset not reported"}
        </p>
      </header>
      <div
        aria-live="polite"
        // Reserve room for badge, explanation and a reason so the card does
        // not jump when verification moves from pending to mismatch/failed.
        className={cn(
          "mt-5 flex min-h-[9rem] gap-2 rounded-lg p-3",
          tone(verified, error),
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            "mt-0.5 shrink-0",
            status === "pending" && "animate-spin",
          )}
          size={18}
        />
        <div>
          <Badge className="mb-1">{copy[status][0]}</Badge>
          <p className="text-sm">{copy[status][1]}</p>
          {record.verification.reason && (
            <p className="mt-1 break-words text-sm font-medium">
              Reason: {record.verification.reason}
            </p>
          )}
        </div>
      </div>
      <dl className="mt-5 grid gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Recipient</dt>
          <dd>
            {record.payTo ? <Address value={record.payTo} /> : "Not reported"}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Protocol</dt>
            <dd>{record.protocol === "mpp" ? "MPP" : record.protocol}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Time</dt>
            <dd>Not recorded</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            Settlement reference
          </dt>
          <dd className="mt-1">
            {record.reference ? (
              <div className="flex flex-wrap items-center gap-2">
                <Address value={record.reference} />
                {link && (
                  <a
                    className="naculus-hit-target relative inline-flex items-center gap-1 rounded text-xs font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer <ExternalLink aria-hidden size={13} />
                  </a>
                )}
              </div>
            ) : (
              "Not reported"
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
