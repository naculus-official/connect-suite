/**
 * Which EVM chain does an account-abstraction operation belong to?
 *
 * The smart-account hooks each resolved this as
 * `options.chainId ?? connectedChainId ?? "eip155:1"`, and each then guarded
 * with `if (connectedChainId && connectedChainId !== target)`. The guard is
 * skipped precisely when the mainnet default is used, so the one branch that
 * assumes a chain is the one branch that never checks it.
 *
 * That branch is reachable: a caller passing its own `signer` needs no
 * session, so `connectedChainId` is legitimately absent. It would then build
 * and sign a UserOperation for chain 1 — with chain 1's EntryPoint — while its
 * configured RPC and bundler point somewhere else. The chain ID is part of the
 * UserOperation hash, so the user approves a commitment to a chain they were
 * never shown.
 *
 * Resolving to undefined instead lets each caller refuse in whatever way suits
 * it. Framework-agnostic on purpose: it must not import React.
 */

/** CAIP-2 for an EVM chain. The reference is a decimal chain ID with no leading zero. */
const EVM_CHAIN_ID = /^eip155:[1-9][0-9]*$/;

export function isEvmChainId(value: string | null | undefined): boolean {
  return typeof value === "string" && EVM_CHAIN_ID.test(value);
}

/**
 * The chain to operate on, or undefined when it cannot be known.
 *
 * An explicitly requested chain wins over the connected one; a malformed value
 * from either source resolves to undefined rather than being replaced by a
 * guess, because the caller asked for something specific and got it wrong.
 */
export function resolveEvmChainId(
  requested: string | null | undefined,
  connected: string | null | undefined,
): string | undefined {
  const candidate = requested ?? connected ?? undefined;
  return isEvmChainId(candidate) ? candidate : undefined;
}
