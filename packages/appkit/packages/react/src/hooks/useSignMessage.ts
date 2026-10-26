import { useState, useCallback } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { WalletError } from "@naculus/connect-core";
import { resolveClient } from "./client-resolver";

export function useSignMessage() {
  const { session, chainId, client } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
        const errorMessage = err instanceof Error ? err.message : "Signing failed";
        const error = err instanceof Error ? err : new Error(errorMessage);
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
