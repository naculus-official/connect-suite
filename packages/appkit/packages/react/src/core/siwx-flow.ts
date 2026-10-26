/**
 * Framework-agnostic SIWx orchestration.
 *
 * The sign-in sequence — pick the chain, pick the account in that chain's
 * namespace, build the message, register its nonce, sign, hand the signature
 * back — has nothing React-specific in it. Only the reaction to failure does
 * (clearing storage, resetting reducer state), so this returns a description
 * of what happened and lets the binding decide what to do about it.
 *
 * Keeping the decision here means Vue, Svelte and native bindings get the same
 * authentication behavior instead of each re-deriving it.
 */
import { logger } from "@naculus/connect-core";
import type { UniversalWalletSession } from "@naculus/connect-core";
import { issueNonce, parseSiwxMessage } from "@naculus/siwx";
import { selectSiwxAccount } from "../hooks/siwx-accounts";

export interface SiwxHandlers {
  createMessage: (input: {
    address: string;
    chainId: string;
  }) => Promise<string>;
  handleSignComplete?: (input: {
    message: string;
    signature: string;
  }) => Promise<void> | void;
  /** When false, a failed sign-in leaves the connection intact. */
  required?: boolean;
}

export type SiwxOutcome =
  | { kind: "skipped" }
  | { kind: "authenticated"; address: string; chainId: string }
  /** `fatal` means the caller must tear the connection down. */
  | { kind: "failed"; error: Error; fatal: boolean };

/**
 * Resolve the chain a SIWx message should be scoped to.
 *
 * `chains[0]` is the active chain by convention across every connector, so the
 * first namespace present wins in a fixed order rather than by object key
 * enumeration, which is not guaranteed to be stable.
 */
export function resolveSiwxChainId(session: UniversalWalletSession): string {
  return (
    session.namespaces.eip155?.chains?.[0] ??
    session.namespaces.solana?.chains?.[0] ??
    session.namespaces.xrpl?.chains?.[0] ??
    "eip155:1"
  );
}

export async function runSiwxFlow(input: {
  session: UniversalWalletSession | null;
  siwx: SiwxHandlers | undefined;
  signMessage: (
    session: UniversalWalletSession,
    args: { message: string; address: string; chainId: string },
  ) => Promise<unknown>;
}): Promise<SiwxOutcome> {
  const { session, siwx, signMessage } = input;
  if (!siwx || !session) return { kind: "skipped" };

  try {
    const chainId = resolveSiwxChainId(session);
    const account = selectSiwxAccount(session, chainId);
    if (!account) throw new Error("No account found in session");
    const { address } = account;

    const message = await siwx.createMessage({ address, chainId });
    const parsed = parseSiwxMessage(message);
    if (!parsed?.nonce) {
      // A message the verifier cannot parse would be signed and then rejected
      // server-side, so refuse before asking the user to sign anything.
      throw new Error("SIWx message must contain a nonce");
    }
    await issueNonce(parsed.nonce);

    const signature = (await signMessage(session, {
      message,
      address,
      chainId,
    })) as string;

    await siwx.handleSignComplete?.({ message, signature });
    return { kind: "authenticated", address, chainId };
  } catch (cause) {
    const error =
      cause instanceof Error
        ? cause
        : new Error("Wallet authentication failed");
    logger.error("appkit/core", "SIWx authentication failed:", cause);
    return { kind: "failed", error, fatal: siwx.required !== false };
  }
}
