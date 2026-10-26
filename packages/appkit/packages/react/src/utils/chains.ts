import { resolveChain } from "@naculus/connect-appkit-core";
import type { WalletChain } from "../types";
import {
  CHAINS,
  DEFAULT_RPC_URLS,
  eip155Reference,
  getRpcUrl,
} from "@naculus/connect-core";

// ─── Static Overrides ──────────────────────────────────────────────
// Chains that exist in the old default list but are NOT in chain-registry.
// These are deprecated testnets; keep for backward compatibility.

const STATIC_TESTNETS: WalletChain[] = [
  {
    caip2: "eip155:5",
    name: "Goerli",
    rpcUrl: "https://goerli.blockpi.network/v1/rpc/public",
    explorerUrl: "https://goerli.etherscan.io",
    token: "ETH",
  },
  {
    caip2: "eip155:80001",
    name: "Mumbai",
    rpcUrl: "https://rpc-mumbai.maticvigil.com",
    explorerUrl: "https://mumbai.polygonscan.com",
    token: "MATIC",
  },
  {
    caip2: "eip155:421613",
    name: "Arbitrum Goerli",
    rpcUrl: "https://goerli-rollup.arbitrum.io/rpc",
    explorerUrl: "https://goerli.arbiscan.io",
    token: "ETH",
  },
  {
    caip2: "eip155:420",
    name: "Optimism Goerli",
    rpcUrl: "https://goerli.optimism.io",
    explorerUrl: "https://goerli-optimism.etherscan.io",
    token: "ETH",
  },
];

// ─── Build from Registry ───────────────────────────────────────────
// Derive WalletChain entries from the single-source-of-truth chain-registry
// and the RPC URL defaults from rpc.ts.

function toWalletChain(chainId: number): WalletChain | null {
  const info = CHAINS[chainId];
  if (!info) return null;

  // Only include chains with an explorer URL (meaningful for UI display)
  if (!info.explorerUrl) return null;

  const caip2Id = info.caip2Id;

  return {
    caip2: caip2Id,
    name: info.name,
    rpcUrl: getRpcUrl(caip2Id, DEFAULT_RPC_URLS[caip2Id] ?? ""),
    explorerUrl: info.explorerUrl,
    token: info.nativeCurrency.symbol,
  };
}

function buildDefaultChains(): WalletChain[] {
  if (!CHAINS) return [];

  const registryChains: WalletChain[] = [];

  // Order by chain ID for deterministic output
  const chainIds = Object.keys(CHAINS)
    .map(Number)
    .sort((a, b) => a - b);

  for (const id of chainIds) {
    const chain = toWalletChain(id);
    if (chain) {
      registryChains.push(chain);
    }
  }

  // Append static testnets that aren't in the registry
  for (const testnet of STATIC_TESTNETS) {
    // eip155Reference rather than a split: the registry is keyed by an
    // EIP-155 number, and only a chain that has one can collide with it.
    const reference = eip155Reference(testnet.caip2);
    if (reference === null || !CHAINS[reference]) {
      registryChains.push(testnet);
    }
  }

  return registryChains;
}

export const DEFAULT_EVM_CHAINS: WalletChain[] = buildDefaultChains();

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * The configured chain for a CAIP-2 id.
 *
 * Delegates rather than parsing again. The version this replaces did
 * `parseInt(chainId.split(":")[1])`, which answers 5 for
 * `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`.
 */
export function getChainById(chains: WalletChain[], chainId: string): WalletChain | undefined {
  return resolveChain(chains, chainId) ?? undefined;
}

export function getDefaultChains(): WalletChain[] {
  return [...DEFAULT_EVM_CHAINS];
}
