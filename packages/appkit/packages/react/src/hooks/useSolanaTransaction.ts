import { WalletError } from "@naculus/connect-core";
import { useCallback, useState } from "react";
import {
  getSignatureStatus,
  type SolanaConfirmationStatus,
} from "@naculus/connect-core";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";

export interface UseSolanaTransactionReturn {
  /**
   * Sign a serialized transaction and return the signed bytes.
   *
   * Build and serialize it with `@solana/kit` or `@solana/web3.js` first —
   * the wallet's job is the signature, not the instructions. base64 or raw
   * bytes both work.
   */
  signTransaction: (
    transaction: Uint8Array | string,
  ) => Promise<Uint8Array>;
  /** Sign and submit, returning the base58 signature the cluster reports. */
  sendTransaction: (transaction: Uint8Array | string) => Promise<string>;
  /** Poll a signature. `"unknown"` is its own answer, not a failure. */
  getStatus: (
    signature: string,
  ) => Promise<{ status: SolanaConfirmationStatus; error: string | null }>;
  isSigning: boolean;
  isSending: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Sign and send Solana transactions through whichever wallet is connected.
 *
 * The wallet is not asked to understand the transaction. It fills its own
 * signature slot and, for send, hands the bytes to a cluster.
 */
export function useSolanaTransaction(): UseSolanaTransactionReturn {
  const { client, session } = useWeb3();
  const [isSigning, setIsSigning] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const requireSession = () => {
    const activeClient = resolveClient(client);
    if (!activeClient || !session) {
      throw new WalletError("wallet_unavailable", "No connected wallet.");
    }
    return activeClient;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: requireSession reads client and session, which are the dependencies
  const signTransaction = useCallback(
    async (transaction: Uint8Array | string) => {
      setIsSigning(true);
      setError(null);
      try {
        const activeClient = requireSession();
        const signed = await activeClient.signTransaction(session!, {
          transaction,
        });
        return signed as Uint8Array;
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Signing failed");
        setError(e);
        throw e;
      } finally {
        setIsSigning(false);
      }
    },
    [client, session],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: requireSession reads client and session, which are the dependencies
  const sendTransaction = useCallback(
    async (transaction: Uint8Array | string) => {
      setIsSending(true);
      setError(null);
      try {
        const activeClient = requireSession();
        const signature = await activeClient.sendTransaction(session!, {
          transaction,
        });
        return signature as string;
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Send failed");
        setError(e);
        throw e;
      } finally {
        setIsSending(false);
      }
    },
    [client, session],
  );

  const getStatus = useCallback(
    async (signature: string) => {
      const rpcUrl = resolveClient(client)?.solanaRpcUrl;
      if (!rpcUrl) {
        throw new WalletError(
          "no_rpc",
          "Set solanaRpcUrl on the client to read a signature's status.",
        );
      }
      return getSignatureStatus(rpcUrl, signature);
    },
    [client],
  );

  return {
    signTransaction,
    sendTransaction,
    getStatus,
    isSigning,
    isSending,
    error,
    reset: () => setError(null),
  };
}
