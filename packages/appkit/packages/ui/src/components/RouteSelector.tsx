"use client";

/**
 * RouteSelector — UI component for cross-chain route selection.
 *
 * Displays route quotes from RouteEngine and lets users pick one.
 * Supports loading, executing, success, and error states.
 *
 * Uses ComponentRegistry for all base UI (Button, Card, Badge, Skeleton, Progress).
 */

import type React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "../lib/cn";
import { getChainLogo } from "../assets/chains";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks";
import type { Token } from "@naculus/connect-core";

/**
 * Shape this component renders, declared locally on purpose.
 *
 * The sibling hooks already define their own domain types ("hook domain
 * types, not core exports") — this component was the one place reaching into
 * core's routing internals, which coupled the UI to whichever routing engine
 * core happened to export. Declaring it here keeps the component usable
 * against any aggregator, which is the point of shipping one appkit for every
 * frontend target.
 */
export interface Route {
  id?: string;
  provider?: string;
  fromChain: string;
  toChain: string;
  fromToken?: string;
  toToken?: string;
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
  steps: Array<{ type?: string; [key: string]: unknown }>;
  gasCosts: { totalUsd: string; [key: string]: unknown };
  estimatedTime: number;
  /** Aggregators attach their own fields; the component only reads the above. */
  [key: string]: unknown;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface TokenDisplay {
  chainId: number;
  address: string;
  symbol: string;
}

export interface RouteSelectorProps {
  /** Optional input token info for the header display */
  inputToken?: TokenDisplay;
  /** Optional output token info for the header display */
  outputToken?: TokenDisplay;
  /** Input amount in human-readable units (natural numbers, not wei) */
  amount?: bigint;
  /** Current list of route quotes (pass empty array for no routes state) */
  routes?: Route[];
  /** Whether route quotes are being fetched */
  loading?: boolean;
  /** Whether a route execution is in progress */
  executing?: boolean;
  /** Called when user selects a route */
  onRouteSelected?: (route: Route) => void;
  /** Called when user cancels route selection */
  onCancel?: () => void;
  /** Success message (tx hash) after route execution completes */
  successTxHash?: string | null;
  /** Error message to display */
  error?: string | null;
  /** Optional className overrides */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `<1s`;
  if (ms < 60_000) return `~${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec > 0 ? `~${min}m ${sec}s` : `~${min}m`;
}

function formatSymbol(token: Token): string {
  return token.symbol || "UNKNOWN";
}

function getProviderBadgeVariant(provider: string): string {
  const p = provider.toLowerCase();
  if (p.includes("lifi")) return "default";
  if (p.includes("axelar")) return "secondary";
  return "outline";
}

function formatTxHash(txHash: string): string {
  return txHash.length > 12
    ? `${txHash.slice(0, 6)}...${txHash.slice(-6)}`
    : txHash;
}

// ── Route Card ────────────────────────────────────────────────────────

interface RouteCardProps {
  route: Route;
  onSelect: () => void;
}

function RouteCard({ route, onSelect }: RouteCardProps) {
  const registry = useComponentRegistry();
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton;
  const Badge = registry.Badge as React.ComponentType<
    React.HTMLAttributes<HTMLSpanElement> & { variant?: string }
  >;

  const providerName = route.provider ?? "Route";

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-accent/30">
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-center gap-2">
          {Badge ? (
            <Badge variant={getProviderBadgeVariant(providerName)}>
              {providerName}
            </Badge>
          ) : (
            <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
              {providerName}
            </span>
          )}
          {route.steps.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {route.steps.length} steps
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            ${route.gasCosts.totalUsd}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(
              route.steps.reduce<number>((max, _step) => {
                // Estimate: 15s per swap step, 2min per bridge step
                const baseTime = route.estimatedTime > 0 ? 15_000 : 0;
                return max + baseTime;
              }, 0),
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {route.gasCosts.totalUsd} cost
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSelect}
      >
        Select
      </Button>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function LoadingSkeleton() {
  const registry = useComponentRegistry();
  const Skeleton = registry.Skeleton as React.ComponentType<
    React.HTMLAttributes<HTMLDivElement>
  >;

  return (
    <div className="flex flex-col gap-3" data-testid="route-selector-loading">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Fetching best routes...</span>
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
        >
          <div className="flex flex-col gap-2 flex-1">
            {Skeleton ? (
              <>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-48" />
              </>
            ) : (
              <>
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
              </>
            )}
          </div>
          {Skeleton ? (
            <Skeleton className="h-8 w-20 rounded-md" />
          ) : (
            <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
      data-testid="route-selector-empty"
    >
      <AlertCircle className="h-8 w-8 opacity-40" />
      <span>No routes found for this pair</span>
      <span className="text-xs">Try a different token or amount</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const registry = useComponentRegistry();
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton;

  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-6"
      data-testid="route-selector-error"
    >
      <XCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-destructive font-medium">Failed to fetch routes</p>
      <p className="text-xs text-muted-foreground max-w-xs text-center">{error}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function ExecutionProgress() {
  const registry = useComponentRegistry();
  const Progress = registry.Progress as React.ComponentType<
    React.HTMLAttributes<HTMLDivElement> & { value?: number }
  >;

  return (
    <div className="flex flex-col items-center gap-3 py-6" data-testid="route-selector-executing">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm font-medium">Executing route...</p>
      <p className="text-xs text-muted-foreground">Please confirm the transaction in your wallet</p>
      {Progress ? (
        <Progress value={50} className="w-48 h-1.5" />
      ) : (
        <div className="h-1.5 w-48 rounded-full bg-muted">
          <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
        </div>
      )}
    </div>
  );
}

function SuccessState({ txHash }: { txHash: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 py-6"
      data-testid="route-selector-success"
    >
      <CheckCircle2 className="h-8 w-8 text-green-500" />
      <p className="text-sm font-medium text-green-600 dark:text-green-400">
        Route executed successfully!
      </p>
      <p className="text-xs text-muted-foreground font-mono">
        TX: {formatTxHash(txHash)}
      </p>
    </div>
  );
}

function ChainLogo({ chainId, className }: { chainId: number; className?: string }) {
  const svgStr = getChainLogo(`eip155:${chainId}`);
  if (!svgStr) return null;
  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: svgStr is one of the static SVG strings bundled in assets/chains, never external input
      dangerouslySetInnerHTML={{ __html: svgStr }}
    />
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function RouteSelector({
  inputToken,
  outputToken,
  amount,
  routes = [],
  loading = false,
  executing = false,
  onRouteSelected,
  onCancel,
  successTxHash,
  error,
  className,
}: RouteSelectorProps) {
  const registry = useComponentRegistry();
  const Card = registry.Card as React.ComponentType<
    React.HTMLAttributes<HTMLDivElement>
  >;
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton;

  // ── Determine state ──────────────────────────────────────────────

  // Execution states take precedence
  if (successTxHash) {
    return (
      <div className={cn("rounded-lg border border-border", className)}>
        <SuccessState txHash={successTxHash} />
      </div>
    );
  }

  if (executing) {
    return (
      <div className={cn("rounded-lg border border-border", className)}>
        <ExecutionProgress />
      </div>
    );
  }

  // ── Content ──────────────────────────────────────────────────────

  const content = Card ? (
    <Card className={cn("p-4", className)}>
      {renderHeader()}
      {renderBody()}
      {renderFooter()}
    </Card>
  ) : (
    <div className={cn("rounded-lg border border-border p-4", className)}>
      {renderHeader()}
      {renderBody()}
      {renderFooter()}
    </div>
  );

  return content;

  // ── Internal render helpers ─────────────────────────────────────

  function renderHeader() {
    if (!inputToken && !outputToken) return null;

    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {inputToken && (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <ChainLogo chainId={inputToken.chainId} className="h-4 w-4" />
            {amount ? `${amount.toString()} ` : ""}
            {formatSymbol(inputToken as unknown as Token)}
          </span>
        )}
        {inputToken && outputToken && (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        {outputToken && (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <ChainLogo chainId={outputToken.chainId} className="h-4 w-4" />
            {formatSymbol(outputToken as unknown as Token)}
          </span>
        )}
      </div>
    );
  }

  function renderBody() {
    if (loading) {
      return <LoadingSkeleton />;
    }

    if (error) {
      return <ErrorState error={error} />;
    }

    if (routes.length === 0) {
      return <EmptyState />;
    }

    return (
      <div className="flex flex-col gap-2" data-testid="route-selector-routes">
        {routes.map((route, idx) => (
          <RouteCard
            // biome-ignore lint/suspicious/noArrayIndexKey: quotes can repeat chain pair and cost; the index disambiguates, and the list is replaced as a whole
            key={`${route.fromChain}-${route.toChain}-${route.gasCosts.totalUsd}-${idx}`}
            route={route}
            onSelect={() => onRouteSelected?.(route)}
          />
        ))}
      </div>
    );
  }

  function renderFooter() {
    // Show cancel button only when we have routes to select or are loading
    if (!loading && routes.length === 0 && !error) return null;

    return (
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    );
  }
}
