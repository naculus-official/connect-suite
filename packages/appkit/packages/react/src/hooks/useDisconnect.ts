import { useCallback, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";

export function useDisconnect() {
  const { disconnect, status } = useWeb3();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const handleDisconnect = useCallback(async () => {
    if (status === "disconnected") return;

    setIsLoading(true);
    setError(null);

    try {
      await disconnect();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error("Disconnect failed"));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [disconnect, status]);

  return {
    disconnect: handleDisconnect,
    isDisconnecting: isLoading,
    error,
    cleanup: () => { mountedRef.current = false; },
  };
}