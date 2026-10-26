/** React state shell for the framework-neutral eth_call revert preview. */
import { simulateTransactionPreview } from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import type { EvmTransaction } from "../types";
import { useAccount } from "./useAccount";
import { useChain } from "./useChain";
import { useViemClient } from "./useViemClient";

export type {
  ApprovalChange,
  BalanceChange,
  GasInfo,
  RiskAssessment,
  RiskLevel,
  RiskWarning,
  SimulationResult,
  SimulationStatus,
} from "@naculus/wallet-engine";

import type { SimulationResult } from "@naculus/wallet-engine";

export interface UseTransactionSimulationReturn {
  result: SimulationResult | undefined;
  isSimulating: boolean;
  error: Error | null;
  simulate: () => Promise<SimulationResult>;
  reset: () => void;
}

export function useTransactionSimulation(
  tx: EvmTransaction | undefined,
  chainId?: number,
): UseTransactionSimulationReturn {
  useWeb3();
  const { evmAccount } = useAccount();
  const { currentChain } = useChain();
  const { publicClient } = useViemClient();
  const [result, setResult] = useState<SimulationResult | undefined>(undefined);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const simulate = useCallback(async (): Promise<SimulationResult> => {
    if (tx) {
      setIsSimulating(true);
      setError(null);
    }
    try {
      const simResult = await simulateTransactionPreview(tx, {
        chainId,
        currentChain,
        publicClient,
        evmAccount,
      });
      setResult(simResult);
      return simResult;
    } catch (cause) {
      const err =
        cause instanceof Error ? cause : new Error("Simulation failed");
      setError(err);
      throw err;
    } finally {
      if (tx) setIsSimulating(false);
    }
  }, [tx, chainId, currentChain, publicClient, evmAccount]);

  useEffect(() => {
    if (!tx) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      simulate().catch(() => {
        // Error is captured in state.
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tx, simulate]);

  const reset = useCallback(() => {
    setResult(undefined);
    setError(null);
    setIsSimulating(false);
  }, []);

  return { result, isSimulating, error, simulate, reset };
}
