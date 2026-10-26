import { useCallback, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { WalletError } from "@naculus/connect-core";

export function useConnect() {
  const { connect, status } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await connect();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      setError(err instanceof WalletError ? err : new Error(errorMessage));
    } finally {
      setIsLoading(false);
    }
  }, [connect]);

  return {
    connect: handleConnect,
    isConnecting: isLoading || status === "connecting",
    error
  };
}