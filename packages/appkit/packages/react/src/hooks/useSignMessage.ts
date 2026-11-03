import { useState, useCallback } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { WalletError } from "@naculus/connect-core";
import { resolveClient } from "./client-resolver";

/**
 * Keep the wallet's own reason on the hook error. EIP-1193 providers often
 * reject with a plain `{ code, message }` object rather than an Error, and
 * replacing that with a bare "Signing failed" left the app unable to tell
 * 4100 (not authorized) from any other wallet failure. An Error is passed
 * through untouched, so a 4001 rejection reads exactly as before.
 */
function toSignError(cause: unknown): Error & { code?: number | string } {
  if (cause instanceof Error) return cause;
  if (!cause || typeof cause !== "object") return new Error("Signing failed");
  const { code, message } = cause as { code?: unknown; message?: unknown };
  const error: Error & { code?: number | string } = new Error(
    typeof message === "string" && message ? message : "Signing failed",
    { cause },
  );
  if (typeof code === "number" || typeof code === "string") error.code = code;
  return error;
}

export function useSignMessage() {
  const { session, chainId, client } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<
    (Error & { code?: number | string }) | null
  >(null);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      // Precondition checks — set error state before throwing (consistent with useSendTransaction pattern)
      if (!session) {
        const err = new WalletError("wallet_unavailable", "No active session");
        setError(err);
        throw err;
      }

      const address = session.namespaces.eip155?.accounts[0]
        ?? Object.values(session.namespaces)[0]?.accounts[0];

      if (!address) {
        const err = new WalletError("wallet_unavailable", "No account found");
        setError(err);
        throw err;
      }

      setIsLoading(true);
      setError(null);

      try {
        const activeClient = resolveClient(client);
        if (!activeClient) {
          throw new WalletError("wallet_unavailable", "Client not initialized");
        }
        const result = (await activeClient.signMessage(session, {
          message,
          address,
          chainId: chainId ?? undefined
        })) as string;

        return result;
      } catch (err) {
        const error = toSignError(err);
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [session, chainId, client]
  );

  return {
    signMessage,
    isSigning: isLoading,
    error
  };
}
