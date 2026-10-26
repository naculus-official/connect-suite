/**
 * Solana signer roles, read once for both frameworks.
 *
 * `@naculus/connector-solana` splits a connected wallet into `identity`,
 * `signer` and `payer`, each `null` when the wallet declared it cannot fill
 * that job. That answer is the connector's. What this module owns is the part
 * a UI has to decide before it can show anything: *why* there is no answer —
 * because nothing is connected, because the connected wallet is not Solana,
 * or because the connector predates the roles API and has not said. Those are
 * three different screens, and a hook that hands back one `null` for all of
 * them makes every consumer rediscover the distinction.
 */

/** Which account this is, with no ability to sign for it. */
export interface SolanaIdentity {
  /** Base58 public key. */
  readonly address: string;
  /** CAIP-2 chain this account is being used on. */
  readonly chain: string;
}

/** An account that will contribute a signature without submitting anything. */
export interface SolanaSigner extends SolanaIdentity {
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: (transaction: Uint8Array) => Promise<Uint8Array>;
  /** Absent, not throwing, when the wallet has no batch feature. */
  signAllTransactions?: (transactions: Uint8Array[]) => Promise<Uint8Array[]>;
}

/** An account that signs and broadcasts through the wallet's own RPC. */
export interface SolanaPayer extends SolanaIdentity {
  /** Returns the base58 transaction signature the cluster accepted. */
  signAndSendTransaction: (transaction: Uint8Array) => Promise<string>;
}

/** What the wallet declared, recorded at discovery. Two-state on purpose. */
export interface SolanaWalletFeatures {
  signMessage: boolean;
  signTransaction: boolean;
  signAllTransactions: boolean;
  signAndSendTransaction: boolean;
}

/**
 * The roles a connected account can fill.
 *
 * Structurally identical to `SolanaRoles` in `@naculus/connector-solana`,
 * declared here rather than imported because this package depends only on
 * `@naculus/connect-core`, and the connector's own declaration is what its
 * `getRoles` returns — a value of that type satisfies this one unchanged.
 */
export interface SolanaRoles {
  identity: SolanaIdentity;
  signer: SolanaSigner | null;
  payer: SolanaPayer | null;
  features: SolanaWalletFeatures;
}

/** The part of a connector this needs. `getRoles` is optional on purpose. */
export interface SolanaRolesSource {
  getRoles?: (session: unknown) => SolanaRoles | null;
}

/** The part of a session this needs. */
export interface SessionLike {
  walletType?: string;
}

/**
 * Why `roles` is null.
 *
 * - `no_session` — nothing connected, or the connector has no live session
 *   for the one the app holds (a restored session before reconnect).
 * - `not_solana` — the connected wallet is on another namespace. Not an
 *   error; a Solana panel simply does not apply.
 * - `unreported` — the connector does not expose `getRoles`. An older
 *   `@naculus/connector-solana`, or a custom one. The wallet has not said
 *   what it can do, which is not the same as saying it can do nothing.
 */
export type SolanaRolesAbsence = "no_session" | "not_solana" | "unreported";

export type SolanaRolesState =
  | { roles: SolanaRoles; absence: null }
  | { roles: null; absence: SolanaRolesAbsence };

/**
 * Read the roles for the session the app holds.
 *
 * Synchronous and pure: the connector already recorded what the wallet
 * declared, so there is nothing to await and no prompt to trigger. Reading
 * roles must never cost the user an approval dialog.
 */
export function readSolanaRoles(
  connector: SolanaRolesSource | null | undefined,
  session: SessionLike | null | undefined,
): SolanaRolesState {
  if (!session) return { roles: null, absence: "no_session" };
  if (session.walletType !== "solana") {
    return { roles: null, absence: "not_solana" };
  }
  if (typeof connector?.getRoles !== "function") {
    return { roles: null, absence: "unreported" };
  }
  const roles = connector.getRoles(session);
  return roles
    ? { roles, absence: null }
    : { roles: null, absence: "no_session" };
}
