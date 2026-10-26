import { chainNumber, encodeErc20Transfer } from "@naculus/connect-appkit-core";
/**
 * useERC20TransferSimulation — React hook for simulating ERC-20 token
 *                              transfers before signing/submitting.
 *
 * Wraps useTransactionSimulation with ERC-20 transfer calldata building,
 * so callers only need the token, recipient, and amount.
 *
 * @see /docs/features/transaction-simulation.md
 */

import { parseUnits, type TokenConfig } from "@naculus/connect-core";
import { useMemo } from "react";
import type { EvmTransaction } from "../types";
import { useAccount } from "./useAccount";
import { useChain } from "./useChain";
import {
  type SimulationResult,
  type UseTransactionSimulationReturn,
  useTransactionSimulation,
} from "./useTransactionSimulation";

// ── Types ─────────────────────────────────────────────────────────

export interface UseERC20TransferSimulationOptions {
  /** Token configuration (address, decimals, chainId) */
  token: TokenConfig;
  /** Recipient address */
  to: `0x${string}`;
  /** Amount in human-readable units (e.g. "1.50" for 1.5 USDC) */
  amount: string;
}

export interface UseERC20TransferSimulationReturn
  extends Omit<UseTransactionSimulationReturn, "simulate"> {
  /** Simulation result for the built ERC-20 transfer */
  result: SimulationResult | undefined;
  /** Whether a simulation is in progress */
  isSimulating: boolean;
  /** Error from the last simulation attempt */
  error: Error | null;
  /** Re-run the simulation with current parameters */
  reSimulate: () => Promise<SimulationResult>;
  /** Reset simulation state */
  reset: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useERC20TransferSimulation(
  options: UseERC20TransferSimulationOptions,
): UseERC20TransferSimulationReturn {
  const { evmAccount, isConnected } = useAccount();
  const { currentChain } = useChain();
  // No `?? 1`. TokenConfig.chainId says where the token lives; falling back to
  // mainnet simulates against whatever contract occupies that address there.
  const chainId =
    options.token.chainId ??
    (currentChain ? (chainNumber(currentChain) ?? undefined) : undefined);

  // Build the transaction descriptor from ERC-20 transfer params
  const tx: EvmTransaction | undefined = useMemo(() => {
    if (!isConnected || !evmAccount) return undefined;

    try {
      // No `?? 18`. A simulation built with the wrong precision previews a
      // different transfer than the one that will be sent, which is worse
      // than showing no preview at all.
      const decimals = options.token.decimals;
      if (decimals === undefined) return undefined;
      const rawAmount = parseUnits(options.amount, decimals);
      const data = encodeErc20Transfer(options.to, rawAmount);

      return {
        to: options.token.address,
        data,
        value: "0",
      };
    } catch {
      // Fail closed: never preview calldata different from what sendTransfer accepts.
      return undefined;
    }
  }, [
    options.token.address,
    options.token.decimals,
    options.to,
    options.amount,
    evmAccount,
    isConnected,
  ]);

  // Use the base transaction simulation hook
  const sim = useTransactionSimulation(tx, chainId);

  // Alias simulate → reSimulate for semantic clarity
  return {
    // The base hook may still hold (or later receive) the previous transaction's
    // result. Never display it for inputs that cannot produce sendable calldata.
    result: tx ? sim.result : undefined,
    isSimulating: !!tx && sim.isSimulating,
    error: tx ? sim.error : null,
    reSimulate: sim.simulate,
    reset: sim.reset,
  };
}
