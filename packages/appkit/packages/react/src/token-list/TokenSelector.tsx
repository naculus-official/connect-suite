/**
 * TokenSelector — chain-aware, searchable token selection component.
 *
 * Features:
 * - Loads token list for the given chain
 * - Search by symbol, name, or address
 * - Displays token logo, symbol, name, and decimals
 * - Calls onSelect when a token is chosen
 */

import React, { useCallback } from "react";
import type { TokenListEntry } from "@naculus/connect-core";
import { useTokenList } from "./useTokenList";
import { useTokenSearch } from "./useTokenSearch";

export interface TokenSelectorProps {
  /** Chain ID in CAIP-2 format (e.g. "eip155:1") */
  chainId: string;
  /** Called when a token is selected */
  onSelect: (token: TokenListEntry) => void;
  /** Called to close/dismiss the selector */
  onClose: () => void;
  /** Optional configuration */
  options?: {
    /** Show popular/recommended tokens (default: true) */
    showRecommendations?: boolean;
    /** Custom filter for tokens */
    filter?: (token: TokenListEntry) => boolean;
  };
}

/**
 * TokenSelector — a dropdown/modal component for selecting tokens.
 *
 * @example
 * <TokenSelector
 *   chainId="eip155:1"
 *   onSelect={(token) => setSelectedToken(token)}
 *   onClose={() => setOpen(false)}
 * />
 */
export function TokenSelector({
  chainId,
  onSelect,
  onClose,
  options,
}: TokenSelectorProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  const {
    tokens: allTokens,
    isLoading,
    error,
  } = useTokenList(chainId);

  const { results, isSearching } = useTokenSearch(
    searchQuery,
    searchQuery ? chainId : undefined,
  );

  const showRecommendations = options?.showRecommendations ?? true;

  // Display tokens: when searching, show results; otherwise show the full list
  const displayTokens = React.useMemo(() => {
    if (searchQuery.trim()) {
      const combined = [...results.exact, ...results.fuzzy].map((m) => m.token);
      return options?.filter
        ? combined.filter(options.filter)
        : combined;
    }

    const tokens = allTokens;
    return options?.filter
      ? tokens.filter(options.filter)
      : tokens;
  }, [searchQuery, results, allTokens, options?.filter]);

  // Popular tokens for recommendation section
  const popularTokens = React.useMemo(() => {
    if (!showRecommendations || searchQuery.trim()) return [];
    return allTokens.slice(0, 6); // Top 6
  }, [allTokens, showRecommendations, searchQuery]);

  const handleSelect = useCallback(
    (token: TokenListEntry) => {
      onSelect(token);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <div
      style={{
        background: "hsl(var(--background))",
        borderRadius: "12px",
        padding: "16px",
        color: "hsl(var(--foreground))",
        minWidth: "320px",
        maxWidth: "400px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
          Select Token
        </h3>
        <button type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "hsl(var(--muted-foreground))",
            cursor: "pointer",
            fontSize: "18px",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Search Input */}
      <input
        type="text"
        placeholder="Search token name or paste address"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid #333",
          background: "hsl(var(--card))",
          color: "hsl(var(--foreground))",
          fontSize: "14px",
          outline: "none",
          boxSizing: "border-box",
          marginBottom: "12px",
        }}
        // biome-ignore lint/a11y/noAutofocus: focus moves into the search field of the selector the user just opened
        autoFocus
      />

      {/* Loading / Error States */}
      {isLoading && !isSearching && (
        <div style={{ textAlign: "center", padding: "20px", color: "hsl(var(--muted-foreground))" }}>
          Loading tokens...
        </div>
      )}
      {error && (
        <div
          style={{
            textAlign: "center",
            padding: "12px",
            color: "hsl(var(--destructive))",
            fontSize: "13px",
          }}
        >
          Error: {error.message}
        </div>
      )}

      {/* Popular / Recommended Section */}
      {showRecommendations && popularTokens.length > 0 && !searchQuery.trim() && (
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "11px",
              color: "hsl(var(--muted-foreground))",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "8px",
            }}
          >
            Popular
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {popularTokens.map((token) => (
              <button type="button"
                key={`${token.chainId}:${token.address}`}
                onClick={() => handleSelect(token)}
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid #333",
                  borderRadius: "20px",
                  padding: "6px 14px",
                  color: "hsl(var(--foreground))",
                  cursor: "pointer",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {token.logoURI ? (
                  <img
                    src={token.logoURI}
                    alt=""
                    style={{ width: "16px", height: "16px", borderRadius: "50%" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                {token.symbol}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Result Count */}
      {searchQuery.trim() && !isLoading && (
        <div
          style={{
            fontSize: "11px",
            color: "hsl(var(--muted-foreground))",
            marginBottom: "8px",
          }}
        >
          {displayTokens.length > 0 ? (
            <>
              {results.exact.length} exact, {results.fuzzy.length} fuzzy
              {results.hasMore ? " (more available)" : ""}
            </>
          ) : (
            "No results found"
          )}
        </div>
      )}

      {/* Token List */}
      <div
        style={{
          maxHeight: "320px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {displayTokens.map((token) => (
          <button type="button"
            key={`${token.chainId}:${token.address}`}
            onClick={() => handleSelect(token)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 8px",
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
              fontSize: "14px",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = "hsl(var(--card))";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = "transparent";
            }}
          >
            {/* Logo */}
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "hsl(var(--border))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 600,
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {token.logoURI ? (
                <img
                  src={token.logoURI}
                  alt={token.symbol}
                  style={{ width: "100%", height: "100%" }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = "none";
                    (img.parentElement as HTMLElement).textContent =
                      token.symbol.slice(0, 2);
                  }}
                />
              ) : (
                token.symbol.slice(0, 2)
              )}
            </div>

            {/* Token info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "14px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {token.symbol}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "hsl(var(--muted-foreground))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {token.name}
              </div>
            </div>

            {/* Decimals & Chain Info */}
            <div
              style={{
                fontSize: "11px",
                color: "#666",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              <div>{token.decimals} decimals</div>
              <div>Chain {token.chainId}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
