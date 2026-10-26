import { WalletError } from "@naculus/connect-core";
import { useCallback, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import type { EvmTransaction } from "../types";
import { resolveClient } from "./client-resolver";
import { extractTransactionHash } from "./transaction-hash";

/**
 * Where a send has got to.
 *
 * `"submitted"` was `"confirmed"`, which was a claim the hook could not
 * support: `sendTransaction` resolves with a transaction hash, and a hash
 * means the wallet broadcast it — not that it was mined, and not that it
 * succeeded. An interface showing "confirmed" at that moment tells someone
 * their payment went through while it can still revert or never be included.
 *
 * To reach an actual confirmation, watch the returned hash with
 * `useTxMonitor`, where `"confirmed"` is established by a receipt.
 */
export type SendTransactionStatus =
  | "idle"
  | "awaiting_approval"
  | "submitted"
  | "failed";

export function useSendTransaction() {
  const { session, chainId, client } = useWeb3();
  const [status, setStatus] = useState<SendTransactionStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const sendTransaction = useCallback(
    async (transaction: EvmTransaction): Promise<string> => {
      if (!session) {
        setStatus("failed");
        const err = new WalletError("wallet_unavailable", "No active session");
        setError(err);
        throw err;
      }

      const evmAccount = session.namespaces.eip155?.accounts.find(
        (account) =>
          /^eip155:\d+:0x[0-9a-fA-F]{40}$/.test(account) ||
          /^0x[0-9a-fA-F]{40}$/.test(account),
      );

      if (!evmAccount) {
        setStatus("failed");
        const err = new WalletError(
          "wallet_unavailable",
          "No EVM account found",
        );
        setError(err);
        throw err;
      }

      setStatus("awaiting_approval");
      setError(null);

      try {
        const txWithFrom = {
          ...transaction,
          from: transaction.from ?? evmAccount.split(":").pop(),
        };

        const activeClient = resolveClient(client);
        if (!activeClient) {
          throw new WalletError("wallet_unavailable", "Client not initialized");
        }
        const result = await activeClient.sendTransaction(session, {
          transaction: txWithFrom,
          chainId: chainId ?? undefined,
        });
        const hash = extractTransactionHash(result);

        setStatus("submitted");
        return hash;
      } catch (err) {
        setStatus("failed");
        const errorMessage =
          err instanceof Error ? err.message : "Transaction failed";
        setError(err instanceof Error ? err : new Error(errorMessage));
        throw err;
      }
    },
    [session, chainId, client],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    sendTransaction,
    status,
    error,
    reset,
    isSending: status === "awaiting_approval",
  };
}
