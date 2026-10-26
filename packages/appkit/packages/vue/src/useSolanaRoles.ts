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
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

export type {
  SolanaIdentity,
  SolanaPayer,
  SolanaRoles,
  SolanaRolesAbsence,
  SolanaRolesSource,
  SolanaSigner,
  SolanaWalletFeatures,
};

export interface UseSolanaRolesReturn {
  /** The roles the connected account can fill, or null with a reason. */
  roles: ComputedRef<SolanaRoles | null>;
  /** Why `roles` is null. Null when it is not. */
  absence: ComputedRef<SolanaRolesAbsence | null>;
  /** Which account this is. Never null while `roles` is present. */
  identity: ComputedRef<SolanaIdentity | null>;
  /**
   * Signs without submitting. Null when the wallet declared it cannot *and*
   * null when nothing is known; check `absence` to tell those apart.
   */
  signer: ComputedRef<SolanaSigner | null>;
  /** Signs and broadcasts itself. Null under the same two conditions. */
  payer: ComputedRef<SolanaPayer | null>;
}

/**
 * Which roles the connected Solana account can actually fill.
 *
 * Identical in substance to the React hook: every judgement — that a null
 * `signer` from the connector is an answer while a missing `getRoles` is
 * not, that an EVM session is never asked — is in
 * `@naculus/connect-appkit-core`, and neither binding gets to disagree.
 *
 * Takes the connector and session as arguments, the shape `useCapabilities`
 * uses, because Vue has no provider here. Pass the session as a ref so an
 * account switch that replaces it is noticed; the connector reads the live
 * address either way, so a caller holding a stale snapshot still gets the
 * account the wallet moved to.
 */
export function useSolanaRoles(
  connector: MaybeRefOrGetter<SolanaRolesSource | null | undefined>,
  session: MaybeRefOrGetter<{ walletType?: string } | null | undefined>,
): UseSolanaRolesReturn {
  const state = computed(() =>
    readSolanaRoles(toValue(connector), toValue(session)),
  );

  return {
    roles: computed(() => state.value.roles),
    absence: computed(() => state.value.absence),
    identity: computed(() => state.value.roles?.identity ?? null),
    signer: computed(() => state.value.roles?.signer ?? null),
    payer: computed(() => state.value.roles?.payer ?? null),
  };
}
