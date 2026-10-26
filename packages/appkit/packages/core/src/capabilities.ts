/**
 * EIP-5792 capability answers, normalized once.
 *
 * Deciding how to execute before sending is the whole point of
 * `wallet_getCapabilities`, and the reasoning that turns a raw answer into
 * that decision is not React's. It lived inside the React hook, which meant a
 * Vue composable could only get it by copying — and a second copy of "absence
 * is not a denial" is exactly the copy that drifts back into `false`.
 */

import {
  caip2ToHexChain,
  readAtomicSupport,
  type WalletCapabilities,
} from "@naculus/connect-core";

/**
 * Whether a wallet can execute a batch atomically.
 *
 * Three values, not two. A wallet that does not implement
 * `wallet_getCapabilities` has not said no — it has said nothing, and EIP-5792
 * is explicit that absence is not a denial. Collapsing that into `false` sends
 * every such wallet down the sequential path, which is the one where an
 * approve can land and the swap it was for can fail.
 */
export type AtomicSupport = "supported" | "unsupported" | "unknown";

export interface ChainCapabilities {
  /** CAIP-2 chain this describes. */
  chainId: string;
  atomic: AtomicSupport;
  /** Largest batch the wallet will accept, when it says. */
  maxBatchSize?: number;
  /** The raw entry, for capabilities this SDK does not model. */
  raw: WalletCapabilities;
}

/**
 * Turn a wallet's raw answer into per-chain entries.
 *
 * Entries that are not objects are dropped rather than coerced: a wallet
 * answering `null` for a chain has said nothing about it, and inventing an
 * `"unsupported"` there would be the same mistake as reading absence as denial.
 */
export function normalizeCapabilities(
  raw: Record<string, unknown> | null | undefined,
): Record<string, ChainCapabilities> {
  const out: Record<string, ChainCapabilities> = {};
  for (const [key, entry] of Object.entries(raw ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const { supported, maxBatchSize } = readAtomicSupport(
      entry as Record<string, unknown>,
    );
    out[key] = {
      chainId: key,
      atomic: supported ? "supported" : "unsupported",
      ...(maxBatchSize === undefined ? {} : { maxBatchSize }),
      raw: entry as WalletCapabilities,
    };
  }
  return out;
}

/**
 * Find the entry for a chain, by CAIP-2 or by the hex form.
 *
 * Connectors normalize keys to CAIP-2, but a wallet answering in raw hex
 * through a custom connector should still be found rather than reported as
 * "unknown" next to an entry that is sitting right there.
 */
export function selectChainCapabilities(
  capabilities: Record<string, ChainCapabilities> | null | undefined,
  chainId: string | null | undefined,
): ChainCapabilities | null {
  if (!capabilities || !chainId) return null;
  const hex = caip2ToHexChain(chainId);
  return capabilities[chainId] ?? (hex ? capabilities[hex] : undefined) ?? null;
}

/**
 * Atomic support for a chain.
 *
 * `"unknown"` covers every case where we have not been told: no query yet, a
 * wallet without the method, a failed query, one still in flight. A caller
 * choosing between an atomic and a sequential path needs that distinction, not
 * a confident `false`.
 */
export function atomicSupportFor(
  capabilities: Record<string, ChainCapabilities> | null | undefined,
  chainId: string | null | undefined,
): AtomicSupport {
  return selectChainCapabilities(capabilities, chainId)?.atomic ?? "unknown";
}
