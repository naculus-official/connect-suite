"use client"
import { logger } from "@naculus/connect-core";

import { useState, useRef, useEffect } from "react";
import { useChain, useWallet } from "@naculus/connect-appkit-react";
import { cn } from "../lib/cn";
import { getChainLogo } from "../assets/chains";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { NativeButton, type RegistryButton as RegistryButtonType } from "../lib/registry-fallbacks";

export interface ChainSelectorProps {
  className?: string;
  showLabel?: boolean;
  variant?: "dropdown" | "buttons" | "minimal";
}

function logSwitchFailure(error: unknown): void {
  const details =
    error && typeof error === "object" && "details" in error
      ? (error as { details?: unknown }).details
      : undefined
  const causeMessage =
    details instanceof Error ? `${details.name}: ${details.message}` : details
  logger.error("ui/ChainSelector", "switchChain failed", error, causeMessage)
}

function ChainLogo({ chainId, className }: { chainId: string; className?: string }) {
  const svgStr = getChainLogo(chainId)
  if (!svgStr) return null
  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: svgStr is one of the static SVG strings bundled in assets/chains, never external input
      dangerouslySetInnerHTML={{ __html: svgStr }}
    />
  )
}

export function ChainSelector({
  className,
  showLabel = true,
  variant = "dropdown"
}: ChainSelectorProps) {
  const { currentChain, availableChains, switchChain } = useChain();
  const { isConnected } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const registry = useComponentRegistry();
  const RegistryButton = (registry.Button as RegistryButtonType | undefined) ?? NativeButton;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isConnected) {
    return null;
  }

  const chainName = currentChain?.name ?? "Unknown Chain";
  const hasMultipleChains = availableChains.length > 1;

  // Minimal variant: just show chain logo and name
  if (variant === "minimal") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        {currentChain && <ChainLogo chainId={currentChain.caip2} className="h-3.5 w-3.5" />}
        {chainName}
      </div>
    );
  }

  // Buttons variant: show all chains as clickable buttons
  if (variant === "buttons") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {availableChains.map((chain) => {
          const chainId = chain.caip2;
          const isActive = chainId === currentChain?.caip2;
          return (
            <RegistryButton
              key={chainId}
              className={isActive ? cn("bg-accent", "border-primary") : ""}
              onClick={() => {
                if (!isActive) {
                  switchChain(chainId).catch(logSwitchFailure);
                }
              }}
            >
              <ChainLogo chainId={chainId} className="h-4 w-4" />
              {chain.name}
              {chain.token && <span className="text-xs opacity-60">{chain.token}</span>}
            </RegistryButton>
          );
        })}
      </div>
    );
  }

  // Dropdown variant (default) — show current chain as read-only if only one chain
  if (!hasMultipleChains) {
    return (
      <div className={cn("inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm opacity-60 cursor-default", className)}>
        {currentChain && <ChainLogo chainId={currentChain.caip2} className="h-4 w-4" />}
        {chainName}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={cn("relative inline-block", className)}>
      <RegistryButton onClick={() => setIsOpen(!isOpen)}>
        {currentChain && <ChainLogo chainId={currentChain.caip2} className="h-4 w-4" />}
        {chainName}
        <svg aria-hidden="true"
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </RegistryButton>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95 duration-200">
          {showLabel && (
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Switch Network
            </div>
          )}
          {availableChains.map((chain) => {
            const chainId = chain.caip2;
            const isActive = chainId === currentChain?.caip2;
            return (
               <RegistryButton
                key={chainId}
                onClick={() => {
                  if (!isActive) {
                    switchChain(chainId).catch(logSwitchFailure);
                  }
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-accent font-medium"
                    : "hover:bg-accent/50"
                )}
              >
                <ChainLogo chainId={chainId} className="h-4 w-4" />
                <span className="flex-1 text-left">{chain.name}</span>
                {chain.token && (
                  <span className="text-xs text-muted-foreground">{chain.token}</span>
                )}
                {isActive && (
                  <svg aria-hidden="true" className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </RegistryButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
