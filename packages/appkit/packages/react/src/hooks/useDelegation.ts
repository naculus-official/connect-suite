import {
  readDelegation,
  UNKNOWN_DELEGATION,
  type DelegationStatus,
} from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "./useAccount";
import { useViemClient } from "./useViemClient";

export interface UseDelegationReturn extends DelegationStatus {
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Whether the connected EOA currently delegates to contract code — EIP-7702.
 *
 * A delegated account executes like a contract account: it can run several
 * calls in one transaction, which is the thing that decides whether batching
 * is possible at all for an ordinary address.
 *
 * `delegated` is `null` until the code has actually been read, and stays null
 * when the read fails. That is not the same as `false`: treating a failed RPC
 * as "no delegation" is how an account that can batch gets sent down the path
 * for one that cannot.
 */
export function useDelegation(): UseDelegationReturn {
  const { publicClient } = useViemClient();
  const { evmAccount } = useAccount();
  const [status, setStatus] = useState<DelegationStatus>(UNKNOWN_DELEGATION);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const generationRef = useRef(0);

  const address = evmAccount?.includes(":")
    ? evmAccount.split(":").pop()
    : evmAccount;

  const refetch = useCallback(async () => {
    const generation = ++generationRef.current;
    if (!publicClient || !address) {
      setStatus(UNKNOWN_DELEGATION);
      setIsFetching(false);
      setError(null);
      return;
    }
    setIsFetching(true);
    setError(null);
    try {
      const code = await publicClient.getCode({
        address: address as `0x${string}`,
      });
      if (generation !== generationRef.current) return;
      // viem answers `undefined` for an account with no code; the reader wants
      // the RPC's own "0x" so that "no code" stays distinct from "not read".
      setStatus(readDelegation(code ?? "0x"));
    } catch (err) {
      if (generation !== generationRef.current) return;
      setStatus(UNKNOWN_DELEGATION);
      setError(err instanceof Error ? err : new Error("Code read failed"));
    } finally {
      if (generation === generationRef.current) setIsFetching(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...status, isFetching, error, refetch };
}
