/**
 * Does this token belong to the chain the wallet is pointed at?
 *
 * `TokenConfig.chainId` existed but was only ever read as a display label and
 * a cache key. Nothing compared it to the connected chain, so a hook handed a
 * mainnet token config while the wallet sat on Polygon would read — or
 * approve — whatever contract happens to occupy that address on Polygon.
 * Usually that address holds nothing and the call reverts, which is merely
 * confusing. When it holds a different token, `allowance()` returns a
 * plausible number for the wrong asset, and `approve()` grants a spender
 * rights over something the user never looked at.
 *
 * Framework-agnostic on purpose: it must not import React.
 */

import type { TokenConfig } from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";

/**
 * A mismatch, or undefined when the token is on the active chain — or when
 * there is not enough information to tell.
 *
 * Silence on "cannot tell" is deliberate. A token config without a chainId, or
 * a session with no resolved chain, is a gap in what the caller supplied; a
 * guess in either direction would be worse than letting the call proceed and
 * fail on its own terms.
 */
export function tokenChainMismatch(
  token: Pick<TokenConfig, "address" | "chainId">,
  activeChainId: number | undefined,
): WalletError | undefined {
  if (typeof token?.chainId !== "number" || !Number.isFinite(token.chainId)) {
    return undefined;
  }
  if (typeof activeChainId !== "number" || !Number.isFinite(activeChainId)) {
    return undefined;
  }
  if (token.chainId === activeChainId) return undefined;

  return new WalletError(
    "chain_mismatch",
    `Token ${token.address} is configured for chain ${token.chainId}, but the ` +
      `wallet is on chain ${activeChainId}. Switch chains before continuing — ` +
      `the same address holds a different contract on each chain.`,
  );
}
