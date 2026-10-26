/**
 * The types the framework-neutral half of appkit is built on.
 *
 * They live here rather than in the React package because a Vue composable
 * needs to name the same things, and importing them from a package called
 * `-react` would be both odd and a lie about what the dependency is.
 */

import type { Namespace, UniversalWalletSession } from "@naculus/connect-core";

export type WalletChain = {
  /**
   * CAIP-2, and the chain's identity.
   *
   * This was `id: number` alongside a separate `namespace`, which could only
   * ever describe an EIP-155 chain: a Solana reference is base58
   * (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) and an XRPL one is an
   * unsigned network id. The registry structurally could not hold a non-EVM
   * chain, so every non-EVM path fell out to "unknown".
   *
   * `namespace` is gone rather than kept alongside: two fields that must
   * agree are two fields that eventually do not.
   */
  caip2: string;
  name: string;
  rpcUrl?: string;
  explorerUrl?: string;
  token?: string;
};

export interface ChainInfo {
  namespace: Namespace;
  chainId: string;
  name: string;
  selected: boolean;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "reconnecting";

export interface Web3State {
  status: ConnectionStatus;
  session: UniversalWalletSession | null;
  accounts: string[];
  chainId: string | null;
  error: Error | null;
}
