import { formatAuthorizationAmount } from "@naculus/connect-appkit-core";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks";
import { useComponentRegistry } from "../contexts/ComponentRegistry";

export type AssetMetadata = Record<
  string,
  { symbol: string; decimals: number }
>;

export function short(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export function Address({ value }: { value: string }) {
  const registry = useComponentRegistry();
  const Button =
    (registry.Button as RegistryButton | undefined) ?? NativeButton;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
  };
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="min-w-0 break-all font-mono text-xs"
        title={value}
      >
        {short(value)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="naculus-hit-target h-8 w-8 shrink-0 p-0"
        aria-label={copied ? `Copied ${value}` : `Copy ${value}`}
        onClick={() => void copy()}
      >
        {copied ? (
          <Check aria-hidden size={14} />
        ) : (
          <Copy aria-hidden size={14} />
        )}
      </Button>
    </span>
  );
}

export function formatBaseAmount(
  amount: string | bigint | null,
  asset: string | null,
  assets: AssetMetadata,
): string {
  if (amount === null) return "Amount not reported";
  const metadata = asset ? assets[asset] : undefined;
  if (!/^\d+$/.test(String(amount))) {
    return `${amount.toString()} base units`;
  }
  return formatAuthorizationAmount(BigInt(amount), metadata).formatted;
}

export function tone(success: boolean, danger = false): string {
  return cn(
    "border",
    success
      ? "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100"
      : danger
        ? "border-destructive/60 bg-destructive/10 text-foreground"
        : "border-border bg-muted text-foreground",
  );
}
