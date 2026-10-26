"use client";

import {
  type AuthorizationAssetMetadata,
  type AuthorizationDescription,
  describeAuthorization,
  type Eip3009SessionKeyRail,
  type SessionKeyRailGrantCheck,
  type SpendExplanation,
} from "@naculus/connect-appkit-core";
import type { Authorization, ListedAuthorization } from "@naculus/connect-core";
import { AlertTriangle, ShieldCheck, ShieldX } from "lucide-react";
import type React from "react";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { cn } from "../lib/cn";
import {
  NativeButton,
  NativeCard,
  type RegistryButton,
} from "../lib/registry-fallbacks";
import { Address, tone } from "./payment-ui";

export interface AuthorizationConsentProps {
  authorization: Authorization | ListedAuthorization | AuthorizationDescription;
  assets?: Record<string, AuthorizationAssetMetadata>;
  trustedAssets?: readonly string[];
  locale?: string;
  /** Unix timestamp in seconds, for a stable relative expiry. */
  now?: number;
  enforcement?: "on-chain" | "device";
  requester: { name: string; icon?: string; origin?: string };
  preview?: SpendExplanation;
  onApprove: () => void;
  onDecline: () => void;
  busy?: boolean;
  railGrantCheck?: SessionKeyRailGrantCheck;
  onRegrant?: (missingRail: Eip3009SessionKeyRail) => void;
  className?: string;
}

function isDescription(
  value: Authorization | ListedAuthorization | AuthorizationDescription,
): value is AuthorizationDescription {
  return "expiry" in value;
}

export function AuthorizationConsent({
  authorization,
  assets = {},
  trustedAssets,
  locale,
  now,
  enforcement,
  requester,
  preview,
  onApprove,
  onDecline,
  busy = false,
  railGrantCheck,
  onRegrant,
  className,
}: AuthorizationConsentProps) {
  const description = isDescription(authorization)
    ? authorization
    : describeAuthorization(authorization, {
        assets,
        trustedAssets,
        locale,
        now,
        enforcement,
      });
  const registry = useComponentRegistry();
  const Button =
    (registry.Button as RegistryButton | undefined) ?? NativeButton;
  const Card =
    (registry.Card as
      | React.ComponentType<React.HTMLAttributes<HTMLDivElement>>
      | undefined) ?? NativeCard;

  return (
    <section
      aria-labelledby="authorization-consent-title"
      className={cn(
        "naculus-payment-surface naculus-authorization-consent mx-auto flex w-full max-w-lg flex-col gap-4 overflow-y-auto text-foreground",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDecline();
      }}
    >
      <header className="naculus-consent-requester flex min-w-0 items-center gap-3">
        {requester.icon ? (
          <img
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
            src={requester.icon}
            alt=""
          />
        ) : (
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-lg font-semibold"
          >
            {requester.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h2
            id="authorization-consent-title"
            className="truncate text-lg font-semibold"
          >
            Allow {requester.name} to pay?
          </h2>
          {requester.origin && (
            <p className="break-all text-xs text-muted-foreground">
              {requester.origin}
            </p>
          )}
        </div>
      </header>

      {railGrantCheck?.status === "needs-regrant" && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle aria-hidden className="shrink-0" size={18} />
          <div>
            <p className="font-semibold">Re-grant needed</p>
            <p>
              This session key cannot sign {railGrantCheck.missingRail}{" "}
              payments. Create a new wallet-approved grant for the same account
              and chain.
            </p>
            {onRegrant && (
              <Button
                className="mt-2"
                onClick={() => onRegrant(railGrantCheck.missingRail)}
              >
                Re-grant
              </Button>
            )}
          </div>
        </div>
      )}

      {description.warnings.map((warning) => (
        <div
          key={warning}
          role="alert"
          className="naculus-consent-summary flex gap-2 rounded-lg border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100"
        >
          <AlertTriangle aria-hidden className="mt-0.5 shrink-0" size={18} />
          <strong>{warning}</strong>
        </div>
      ))}

      {preview && (
        <div
          className={cn(
            "naculus-consent-summary flex gap-2 rounded-lg p-3 text-sm",
            tone(preview.allowed, !preview.allowed),
          )}
        >
          {preview.allowed ? (
            <ShieldCheck aria-hidden size={18} />
          ) : (
            <ShieldX aria-hidden size={18} />
          )}
          <p>
            <strong>{preview.allowed ? "Allowed" : "Blocked"}.</strong>{" "}
            {preview.sentence}
          </p>
        </div>
      )}

      <div className="naculus-consent-grants flex flex-col gap-3">
        {description.grants.map((grant) => (
          <Card
            key={`${grant.asset}:${grant.recipients.map((recipient) => recipient.full).join(",")}:${grant.perPayment.formatted}:${grant.total.formatted}`}
            className="min-w-0 p-4"
          >
            <h3 className="break-all text-sm font-semibold">
              {grant.assetLabel}
            </h3>
            {grant.assetTrust === "unverified" && (
              <div
                role="alert"
                className="mt-3 flex gap-2 rounded-lg border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100"
              >
                <AlertTriangle aria-hidden className="shrink-0" size={18} />
                <strong>Unverified token — not on the trusted list</strong>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Per payment</p>
                <p className="break-words text-xl font-semibold tabular-nums">
                  {grant.perPayment.formatted}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total limit</p>
                <p className="break-words text-xl font-semibold tabular-nums">
                  {grant.total.formatted}
                </p>
              </div>
              {grant.period && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Period limit</p>
                  <p className="break-words text-xl font-semibold tabular-nums">
                    Up to {grant.period.amount.formatted} every{" "}
                    {grant.period.every}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Starts {grant.period.startsAt}
                  </p>
                </div>
              )}
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-medium">Recipients</dt>
                <dd className="mt-1 flex flex-col gap-1">
                  {grant.recipients.length ? (
                    grant.recipients.map((recipient) => (
                      <Address key={recipient.full} value={recipient.full} />
                    ))
                  ) : (
                    <span className="font-semibold text-destructive">
                      No recipient restriction is displayed
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Payment count</dt>
                <dd className="text-muted-foreground">
                  {grant.count === null
                    ? "No count limit"
                    : `Up to ${grant.count}`}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Payment methods</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {grant.rails.map((rail) => (
                    <span
                      key={rail}
                      className="rounded-full border border-border bg-muted px-2 py-1 text-xs"
                    >
                      {rail}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      {description.enforcementLabel && (
        <p className="text-sm font-medium">{description.enforcementLabel}</p>
      )}

      <div className="naculus-consent-expiry rounded-lg bg-muted p-3 text-sm">
        <p className="font-medium">Expires {description.expiry.relative}</p>
        <time
          className="text-xs text-muted-foreground"
          dateTime={new Date(description.expiry.timestamp * 1000).toISOString()}
        >
          {description.expiry.absolute}
        </time>
      </div>
      <div
        data-payment-actions
        className="naculus-sticky-actions sticky bottom-0 z-10 -mx-1 grid min-h-14 grid-cols-2 gap-3 border-t border-border bg-background px-1 pb-[max(0rem,env(safe-area-inset-bottom))] pt-3"
      >
        <Button variant="outline" onClick={onDecline}>
          Decline
        </Button>
        <Button disabled={busy} aria-busy={busy} onClick={onApprove}>
          {busy ? "Approving…" : "Approve"}
        </Button>
      </div>
    </section>
  );
}
