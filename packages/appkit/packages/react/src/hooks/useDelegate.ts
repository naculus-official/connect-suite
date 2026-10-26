import { bareEvmAddress } from "@naculus/connect-appkit-core";
import {
  delegateAccount,
  eip155Reference,
  REVOKE_DELEGATE,
  type SentDelegation,
  WalletError,
} from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { useAccount } from "./useAccount";
import { useViemClient } from "./useViemClient";

export interface UseDelegateOptions {
  /**
   * Implementations this app trusts to run with full control of the
   * account. Required and empty by default: which contract an EOA runs is the
   * security decision, and nothing is allowed unless listed. Revoking is
   * always allowed.
   */
  allowlist: readonly string[];
}

export interface UseDelegateReturn {
  /** Delegate the connected account to `delegate` (must be allowlisted). */
  delegate: (delegate: `0x${string}`) => Promise<SentDelegation | null>;
  /** Clear the account's delegation. */
  revoke: () => Promise<SentDelegation | null>;
  /** The last sent type-4 transaction and the authorization it carried. */
  result: SentDelegation | null;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * EIP-7702 owner path: delegate or revoke the connected account by sending
 * a type-4 transaction from it.
 *
 * Embedded wallet only. Browser and WalletConnect wallets upgrade accounts
 * through `wallet_sendCalls`; for them this fails with `method_unsupported`
 * before anything is read or signed. Core's `delegateAccount` applies the
 * allowlist and computes both nonces; this hook only wires the session and
 * the pending-nonce read. Pair with `useDelegation().refetch()` once the
 * transaction is included.
 */
export function useDelegate(options: UseDelegateOptions): UseDelegateReturn {
  const { evmAccount } = useAccount();
  const { session, chainId, client } = useWeb3();
  const { publicClient } = useViemClient();
  const [result, setResult] = useState<SentDelegation | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  // A new wallet context invalidates what is on screen; an operation already
  // handed to the wallet keeps the single-flight slot until it settles.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets state when the wallet context changes.
  useEffect(() => {
    requestIdRef.current += 1;
    setResult(null);
    setIsPending(false);
    setError(null);
  }, [session, chainId, evmAccount]);

  const run = useCallback(
    async (
      target: `0x${string}`,
      allowlist: readonly string[],
    ): Promise<SentDelegation | null> => {
      const fail = (nextError: Error): null => {
        setError(nextError);
        return null;
      };
      if (inFlightRef.current) {
        return fail(new Error("A delegation is already in progress"));
      }
      const account = bareEvmAddress(evmAccount);
      if (!session || !account || !chainId) {
        return fail(
          new WalletError("wallet_unavailable", "No connected EVM account"),
        );
      }
      // The nonce must come from the chain the wallet will send on.
      if (
        !publicClient ||
        publicClient.chain?.id !== eip155Reference(chainId)
      ) {
        return fail(
          new WalletError(
            "chain_mismatch",
            `No RPC client for ${chainId}; refusing to read the nonce elsewhere.`,
          ),
        );
      }
      const connector =
        session.walletType === "embedded"
          ? (resolveClient(client)?.embeddedConnector ?? {})
          : {};

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;
      setIsPending(true);
      setError(null);
      setResult(null);
      try {
        const sent = await delegateAccount({
          connector,
          session,
          account,
          chainId,
          delegate: target,
          allowlist,
          getTransactionCount: (address, blockTag) =>
            publicClient.getTransactionCount({ address, blockTag }),
        });
        if (requestId !== requestIdRef.current) return null;
        setResult(sent);
        return sent;
      } catch (err) {
        if (requestId !== requestIdRef.current) return null;
        return fail(
          err instanceof Error ? err : new Error("Failed to send delegation"),
        );
      } finally {
        inFlightRef.current = false;
        if (requestId === requestIdRef.current) setIsPending(false);
      }
    },
    [chainId, client, evmAccount, publicClient, session],
  );

  const delegate = useCallback(
    (target: `0x${string}`) => run(target, options.allowlist),
    [run, options.allowlist],
  );
  const revoke = useCallback(() => run(REVOKE_DELEGATE, []), [run]);

  // Does not unlock single-flight: the transaction may still be signing or
  // broadcasting, and a second one meanwhile would be a second side effect.
  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setResult(null);
    setIsPending(false);
    setError(null);
  }, []);

  return { delegate, revoke, result, isPending, error, reset };
}
