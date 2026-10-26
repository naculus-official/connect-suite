"use client";

import type {
  EmbeddedWalletAccountView,
  WalletNamespace,
} from "@naculus/connect-appkit-react";
import { useEmbeddedWallet } from "@naculus/connect-appkit-react";
import { Check, Copy, Loader2, Plus } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { cn } from "../lib/cn";

export interface AccountSelectorProps {
  className?: string;
  /** Hide the "derive missing accounts" affordance. */
  hideBackfill?: boolean;
  onSelect?: (namespace: WalletNamespace) => void;
}

/**
 * A recovery phrase derives an independent key per BIP-44 coin type, so one
 * phrase owns an EVM account *and* a Solana account. These are not two views
 * of one key: holding one reveals nothing about the other.
 *
 * The label matters. `eip155` is not "Ethereum" — the same address is the
 * user's account on Polygon, Arbitrum and every other EVM chain, and calling
 * it Ethereum would tell someone their Polygon funds live somewhere else.
 */
const NAMESPACE_LABEL: Record<
  WalletNamespace,
  { name: string; detail: string }
> = {
  eip155: {
    name: "Ethereum & EVM",
    detail:
      "One address across Ethereum, Polygon, Arbitrum and every EVM chain",
  },
  solana: {
    name: "Solana",
    detail: "A separate key on a different curve",
  },
};

function shortAddress(address: string): string {
  // Both ends, never one. A user checking an address compares the first and
  // last characters, and a prefix alone is what an address-poisoning attack
  // needs to pass.
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function AccountRow({
  account,
  isActive,
  onSelect,
}: {
  account: EmbeddedWalletAccountView;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label = NAMESPACE_LABEL[account.namespace] ?? {
    name: account.namespace,
    detail: "",
  };

  const copy = useCallback(
    (e: React.MouseEvent) => {
      // Copying an address is not choosing which account signs.
      e.stopPropagation();
      const write = navigator?.clipboard?.writeText;
      if (!write) return;
      write.call(navigator.clipboard, account.address).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        },
        () => {
          // Denied clipboard permission is not worth an error state; the
          // address is on screen and selectable.
        },
      );
    },
    [account.address],
  );

  return (
    // The selectable row also contains a real copy button. A native radio
    // cannot contain that separate action, so the row uses the ARIA radio
    // interaction while avoiding invalid nested buttons.
    // biome-ignore lint/a11y/useSemanticElements: composite row has an independent copy action
    <div
      role="radio"
      tabIndex={0}
      aria-checked={isActive}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "border-primary bg-accent"
          : "border-border hover:bg-accent/50",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 font-medium">
          {label.name}
          {isActive && (
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              Signing
            </span>
          )}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {shortAddress(account.address)}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Copy ${label.name} address`}
        onClick={copy}
        className="naculus-hit-target shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {isActive && <Check size={16} className="shrink-0 text-primary" />}
    </div>
  );
}

/**
 * Lists the accounts an embedded wallet holds and lets the user choose which
 * one signs.
 *
 * Renders nothing when there is no embedded wallet, rather than an empty
 * panel: a consumer can mount this unconditionally.
 */
export interface AccountSelectorViewProps extends AccountSelectorProps {
  accounts: EmbeddedWalletAccountView[];
  activeNamespace: WalletNamespace | null;
  /** Whether a stored phrase could derive an account not listed above. */
  canDerive: boolean;
  setActiveNamespace: (namespace: WalletNamespace) => void;
  backfillAccounts: () => Promise<unknown>;
}

/**
 * The presentation, separated from where the accounts come from.
 *
 * Exported because Storybook and a consumer with its own account source are
 * both real second callers; a raw-key wallet and a phrase wallet differ only
 * in `canDerive`, and that state is otherwise reachable only by importing an
 * actual key.
 */
export function AccountSelectorView({
  className,
  hideBackfill = false,
  onSelect,
  accounts,
  activeNamespace,
  canDerive,
  setActiveNamespace,
  backfillAccounts,
}: AccountSelectorViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(
    (namespace: WalletNamespace) => {
      if (namespace === activeNamespace) return;
      try {
        setActiveNamespace(namespace);
        setError(null);
        onSelect?.(namespace);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not switch account");
      }
    },
    [activeNamespace, setActiveNamespace, onSelect],
  );

  const handleBackfill = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await backfillAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not derive accounts");
    } finally {
      setBusy(false);
    }
  }, [backfillAccounts]);

  if (accounts.length === 0) return null;

  const canBackfill = !hideBackfill && canDerive;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Accounts
        </span>
        <span className="text-[11px] text-muted-foreground">
          Chooses the signing key, not the network
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Wallet accounts"
        className="flex flex-col gap-1.5"
      >
        {accounts.map((account) => (
          <AccountRow
            key={account.namespace}
            account={account}
            isActive={account.namespace === activeNamespace}
            onSelect={() => handleSelect(account.namespace)}
          />
        ))}
      </div>

      {canBackfill && (
        <button
          type="button"
          onClick={handleBackfill}
          disabled={busy}
          className={cn(
            "flex items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground",
            "hover:bg-accent/50 disabled:opacity-60",
          )}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          {busy ? "Deriving…" : "Show accounts this phrase already owns"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Lists the embedded wallet's accounts and lets the user choose which signs.
 *
 * Renders nothing when there is no embedded wallet, so a consumer can mount
 * this unconditionally.
 */
export function AccountSelector(props: AccountSelectorProps) {
  const {
    wallet,
    accounts,
    activeNamespace,
    setActiveNamespace,
    backfillAccounts,
  } = useEmbeddedWallet();
  if (!wallet) return null;
  return (
    <AccountSelectorView
      {...props}
      accounts={accounts}
      activeNamespace={activeNamespace}
      // Only true when deriving can actually do something. A wallet imported
      // from a raw private key has no phrase, so there is no second account
      // to derive — the affordance would promise a key that cannot exist.
      canDerive={wallet.recoveryAvailable && accounts.length < 2}
      setActiveNamespace={setActiveNamespace}
      backfillAccounts={backfillAccounts}
    />
  );
}
