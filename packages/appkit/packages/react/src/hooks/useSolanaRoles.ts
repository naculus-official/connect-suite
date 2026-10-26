import {
  readSolanaRoles,
  type SolanaIdentity,
  type SolanaPayer,
  type SolanaRoles,
  type SolanaRolesAbsence,
  type SolanaRolesSource,
  type SolanaSigner,
  type SolanaWalletFeatures,
} from "@naculus/connect-appkit-core";
import { useMemo } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";

// Re-exported rather than declared here, for the same reason as
// `AtomicSupport`: Vue needs the same shapes, and the declaration that
// `signer` is `null` rather than a throwing stub must exist exactly once.
export type {
  SolanaIdentity,
  SolanaPayer,
  SolanaRoles,
  SolanaRolesAbsence,
  SolanaSigner,
  SolanaWalletFeatures,
};

export interface UseSolanaRolesReturn {
  /** The roles the connected account can fill, or null with a reason. */
  roles: SolanaRoles | null;
  /** Why `roles` is null. Null when it is not. */
  absence: SolanaRolesAbsence | null;
  /** Which account this is. Never null while `roles` is present. */
  identity: SolanaIdentity | null;
  /**
   * Signs without submitting. Null when the wallet declared it cannot — a
   * send-only wallet, the usual shape behind Mobile Wallet Adapter — *and*
   * null when nothing is known; check `absence` to tell those apart.
   */
  signer: SolanaSigner | null;
  /** Signs and broadcasts itself. Null under the same two conditions. */
  payer: SolanaPayer | null;
}

/**
 * Which roles the connected Solana account can actually fill.
 *
 * Ask before building a flow. A multisig proposal, a co-signed escrow or a
 * relayer-submitted transaction needs `signer`; an ordinary transfer needs
 * `payer`; filling an `authority` field needs only `identity`. A wallet can
 * answer yes to one and no to another, and finding out here is what keeps
 * the answer from arriving at the approval prompt instead.
 *
 * Synchronous: the connector recorded what the wallet declared at discovery,
 * so this never prompts. Recomputed when the session or its accounts change,
 * which is how an in-wallet account switch reaches `identity.address`.
 */
export function useSolanaRoles(): UseSolanaRolesReturn {
  const { client, session, accounts } = useWeb3();

  // biome-ignore lint/correctness/useExhaustiveDependencies: `accounts` is a dependency for its identity only. The connector mutates the session in place on an account switch, so `session` alone would not change, but `accounts` is re-derived from it and does.
  return useMemo(() => {
    const connector = resolveClient(client)?.solanaConnector as
      | SolanaRolesSource
      | null
      | undefined;
    const { roles, absence } = readSolanaRoles(connector, session);
    return {
      roles,
      absence,
      identity: roles?.identity ?? null,
      signer: roles?.signer ?? null,
      payer: roles?.payer ?? null,
    };
  }, [client, session, accounts]);
}
