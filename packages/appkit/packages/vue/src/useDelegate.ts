import { bareEvmAddress } from "@naculus/connect-appkit-core";
import {
  delegateAccount,
  eip155Reference,
  REVOKE_DELEGATE,
  type SentDelegation,
  type UniversalConnector,
  type UniversalWalletSession,
  WalletError,
} from "@naculus/connect-core";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, watch } from "vue";

/** Minimal read contract; a viem PublicClient for the chain satisfies it. */
export interface DelegationNonceReader {
  /** The chain this client reads; must match `chainId`. */
  chain?: { id: number };
  getTransactionCount(args: {
    address: `0x${string}`;
    blockTag: "pending";
  }): Promise<unknown>;
}

export interface UseDelegateOptions {
  /**
   * Pass the embedded connector, and only while its session is the one in
   * `session`. Browser and WalletConnect connectors have no
   * `sendDelegation` and are refused; the embedded connector itself refuses
   * a session it did not create.
   */
  connector: MaybeRefOrGetter<
    Pick<UniversalConnector, "sendDelegation"> | null | undefined
  >;
  session: MaybeRefOrGetter<UniversalWalletSession | null | undefined>;
  account: MaybeRefOrGetter<string | null | undefined>;
  chainId: MaybeRefOrGetter<string | null | undefined>;
  client: MaybeRefOrGetter<DelegationNonceReader | null | undefined>;
  /**
   * Implementations this app trusts to run with full control of the
   * account. Nothing is allowed unless listed; revoking always is.
   */
  allowlist: MaybeRefOrGetter<readonly string[]>;
}

export interface UseDelegateReturn {
  delegate: (delegate: `0x${string}`) => Promise<SentDelegation | null>;
  revoke: () => Promise<SentDelegation | null>;
  result: ShallowRef<SentDelegation | null>;
  isPending: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  reset: () => void;
}

/**
 * EIP-7702 owner path, mirroring the React hook: delegate or revoke the
 * connected account with a type-4 transaction it sends itself. Core's
 * `delegateAccount` applies the allowlist and computes the nonces; a
 * connector without `sendDelegation` fails with `method_unsupported` before
 * anything is read. One operation in flight; a superseded result is dropped.
 */
export function useDelegate(options: UseDelegateOptions): UseDelegateReturn {
  const result = shallowRef<SentDelegation | null>(null);
  const isPending = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let requestId = 0;
  let inFlight = false;
  let disposed = false;

  const fail = (cause: Error): null => {
    error.value = cause;
    return null;
  };

  const run = async (
    target: `0x${string}`,
    allowlist: readonly string[],
  ): Promise<SentDelegation | null> => {
    if (inFlight) return fail(new Error("A delegation is already in progress"));
    const session = toValue(options.session);
    const account = bareEvmAddress(toValue(options.account));
    const chainId = toValue(options.chainId);
    if (!session || !account || !chainId) {
      return fail(
        new WalletError("wallet_unavailable", "No connected EVM account"),
      );
    }
    // The nonce must come from the chain the wallet will send on.
    const reader = toValue(options.client);
    if (!reader || reader.chain?.id !== eip155Reference(chainId)) {
      return fail(
        new WalletError(
          "chain_mismatch",
          `No RPC client for ${chainId}; refusing to read the nonce elsewhere.`,
        ),
      );
    }
    const connector = toValue(options.connector) ?? {};

    const own = ++requestId;
    inFlight = true;
    isPending.value = true;
    error.value = null;
    result.value = null;
    try {
      const sent = await delegateAccount({
        connector,
        session,
        account,
        chainId,
        delegate: target,
        allowlist,
        getTransactionCount: (address, blockTag) =>
          reader.getTransactionCount({ address, blockTag }),
      });
      if (disposed || own !== requestId) return null;
      result.value = sent;
      return sent;
    } catch (cause) {
      if (disposed || own !== requestId) return null;
      return fail(
        cause instanceof Error ? cause : new Error("Failed to send delegation"),
      );
    } finally {
      inFlight = false;
      if (!disposed && own === requestId) isPending.value = false;
    }
  };

  /**
   * Clears published state and drops the in-flight result. Does not unlock
   * single-flight: the transaction may still be signing or broadcasting.
   */
  const reset = (): void => {
    requestId++;
    result.value = null;
    isPending.value = false;
    error.value = null;
  };

  // A new wallet context invalidates what is on screen.
  watch(
    [
      () => toValue(options.session),
      () => toValue(options.account),
      () => toValue(options.chainId),
    ],
    reset,
    { flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    requestId++;
  });

  return {
    delegate: (target) => run(target, toValue(options.allowlist)),
    revoke: () => run(REVOKE_DELEGATE, []),
    result,
    isPending,
    error,
    reset,
  };
}
