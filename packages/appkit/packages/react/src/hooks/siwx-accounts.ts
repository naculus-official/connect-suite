import type { UniversalWalletSession } from "@naculus/connect-core";

export interface SiwxAccount {
  namespace: string;
  caip10: string;
  address: string;
}

/**
 * Pick an account from the namespace selected by the SIWx chain.
 * SIWx messages contain a bare account address; CAIP-10 accounts are only
 * used as the source of truth for selecting the right namespace.
 */
export function selectSiwxAccount(
  session: UniversalWalletSession,
  chainId: string,
): SiwxAccount | undefined {
  const namespace = chainId.split(":", 1)[0];
  // SIWx chain and account must come from the same CAIP namespace. Falling
  // back to another namespace can sign an EVM message with a Solana/XRPL
  // address (or vice versa), which is an authentication identity mismatch.
  const preferred = session.namespaces[namespace]?.accounts ?? [];
  const candidate = preferred
    .filter((caip10) => caip10.startsWith(`${namespace}:`))
    .map((caip10) => ({ namespace, caip10 }))[0];
  if (!candidate) return undefined;

  return {
    ...candidate,
    address: candidate.caip10.split(":").pop() ?? candidate.caip10,
  };
}
