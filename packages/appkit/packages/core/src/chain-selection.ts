/**
 * Which chains a session can actually switch to, and what the current one is.
 *
 * Framework-neutral, and deliberately built on `parseChainId` from
 * `@naculus/connect-core` rather than on another `startsWith("eip155:")`.
 */

import { eip155Reference, namespaceOf } from "@naculus/connect-core";
import type { ChainInfo, WalletChain } from "./types";

/**
 * The EIP-155 chain number, or null when this is not an EVM chain.
 *
 * Callers that need a number — a viem client, an ERC-20 read — must handle
 * the null rather than defaulting, because there is no number that means
 * "Solana" and any stand-in would address a real EVM chain.
 */
export function chainNumber(chain: WalletChain): number | null {
  return eip155Reference(chain.caip2);
}

/** The namespace a chain belongs to, read from its CAIP-2 id. */
export function chainNamespace(chain: WalletChain): string | null {
  return namespaceOf(chain.caip2);
}

/**
 * The configured chain for a CAIP-2 id, or null.
 *
 * A string comparison now that `WalletChain` is keyed by CAIP-2. It used to
 * pull an integer out of the id and compare that, which no non-EVM chain
 * could ever match.
 */
export function resolveChain(
  chains: WalletChain[],
  chainId: string | null | undefined,
): WalletChain | null {
  if (!chainId) return null;
  return chains.find((c) => c.caip2 === chainId) ?? null;
}

/**
 * The chains worth offering for the session's namespace.
 *
 * This used to return every configured chain regardless of what was
 * connected, so a Solana wallet was offered Ethereum and Polygon in the
 * switcher. Clicking one asked a wallet that has no concept of EIP-155 to
 * switch to chain 137 — an action the interface presented as available and
 * that could never work.
 *
 * With no connected chain, everything is offered: nothing has been ruled out
 * yet, and hiding the list would leave a user unable to pick.
 */
export function chainsForNamespace(
  chains: WalletChain[],
  chainId: string | null | undefined,
): WalletChain[] {
  if (!chainId) return chains;
  const namespace = namespaceOf(chainId);
  if (!namespace) return chains;
  return chains.filter((c) => chainNamespace(c) === namespace);
}

/**
 * A description of the connected chain for display.
 *
 * Returns something for every namespace. It used to return null for anything
 * that was not EIP-155, so a connected Solana wallet had no chain to show at
 * all and the interface fell back to "Unknown Chain".
 */
export function describeChain(
  chains: WalletChain[],
  chainId: string | null | undefined,
): ChainInfo | null {
  if (!chainId) return null;
  const namespace = namespaceOf(chainId);
  if (!namespace) return null;

  const known = resolveChain(chains, chainId);
  if (known) {
    return { namespace, chainId, name: known.name, selected: true };
  }

  // No configured entry. Name it by its CAIP-2 reference rather than
  // inventing one: "Chain 5" for a Solana cluster would be a fabrication, and
  // the reference is at least something a user can look up.
  const reference = chainId.slice(namespace.length + 1);
  return {
    namespace,
    chainId,
    name: namespace === "eip155" ? `Chain ${reference}` : reference,
    selected: true,
  };
}
