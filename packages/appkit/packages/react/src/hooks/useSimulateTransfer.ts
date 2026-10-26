import { resolveSimulationEndpoint } from "@naculus/connect-appkit-core";

/**
 * useSimulateTransfer — React hook for simulating ERC-20 token transfers.
 *
 * Wraps SimulationManager.simulateERC20Transfer in a React hook with
 * reactive state for loading, result, and error.
 *
 * @example
 * ```tsx
 * import { useSimulateTransfer } from "@naculus/connect-appkit-react";
 *
 * function SendForm({ token, to, amount }) {
 *   const { result, simulate, loading } = useSimulateTransfer({
 *     rpcUrl: "https://eth.llamarpc.com",
 *   });
 *
 *   return (
 *     <div>
 *       <button onClick={() => simulate(token, to, amount)} disabled={loading}>
 *         Simulate Transfer
 *       </button>
 *       {result && <p>Result: {result.status}</p>}
 *     </div>
 *   );
 * }
 * ```
 */

import type { SimulationResult } from "@naculus/wallet-engine";
import { SimulationManager } from "@naculus/wallet-engine";
import { useCallback, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────

export interface UseSimulateTransferOptions {
  /** RPC URL for eth_call simulation */
  rpcUrl?: string;
  /** Default chain ID */
  chainId?: number;
}

export interface UseSimulateTransferReturn {
  /** Current simulation result */
  result: SimulationResult | null;
  /** Whether a simulation is in progress */
  loading: boolean;
  /** Last error (null if no error) */
  error: Error | null;
  /**
   * Simulate an ERC-20 transfer.
   *
   * @param tokenAddress - ERC-20 token contract address
   * @param from - Sender address
   * @param to - Recipient address
   * @param amount - Human-readable amount (e.g. "1.50")
   * @param options - Optional chainId, rpcUrl, decimals override
   */
  simulate: (
    tokenAddress: `0x${string}`,
    from: `0x${string}`,
    to: `0x${string}`,
    amount: string,
    options?: {
      chainId?: number;
      rpcUrl?: string;
      decimals?: number;
    },
  ) => Promise<SimulationResult>;
  /** Reset result and error state */
  reset: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────

/**
 * Hook for simulating an ERC-20 token transfer.
 *
 * Creates a SimulationManager internally and provides a `simulate`
 * function that builds transfer calldata automatically.
 *
 * @param options - Configuration for the underlying SimulationManager
 */
export function useSimulateTransfer(
  options?: UseSimulateTransferOptions,
): UseSimulateTransferReturn {
  const rpcUrl = options?.rpcUrl;
  const chainId = options?.chainId;

  // ── SimulationManager ref (lazy init) ──────────────────────────

  const managerRef = useRef<SimulationManager | null>(null);

  const getManager = useCallback((): SimulationManager => {
    if (!managerRef.current) {
      managerRef.current = new SimulationManager({
        enabled: true,
        rpcUrl,
        autoSimulate: false,
      });
    }
    return managerRef.current;
  }, [rpcUrl]);

  // ── State ──────────────────────────────────────────────────────

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // ── Simulate ───────────────────────────────────────────────────

  const simulate = useCallback(
    async (
      tokenAddress: `0x${string}`,
      from: `0x${string}`,
      to: `0x${string}`,
      amount: string,
      simOptions?: {
        chainId?: number;
        rpcUrl?: string;
        decimals?: number;
      },
    ): Promise<SimulationResult> => {
      setLoading(true);
      setError(null);

      try {
        const manager = getManager();
        // No `?? 1`. Simulating an ERC-20 transfer on the wrong chain reads a
        // different contract at the same address, so the preview describes a
        // transfer that will not happen.
        const endpoint = resolveSimulationEndpoint(
          simOptions?.chainId,
          chainId,
          simOptions?.rpcUrl,
          rpcUrl,
        );
        // Forwarded rather than computed and dropped. Without it a caller's
        // per-call endpoint did nothing, and the simulation ran against
        // whichever URL happened to be baked into the manager on first use.
        const simResult = await manager.simulateERC20Transfer(
          tokenAddress,
          from,
          to,
          amount,
          endpoint.chainId,
          simOptions?.decimals,
          endpoint.rpcUrl,
        );

        setResult(simResult);
        return simResult;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        throw errorObj;
      } finally {
        setLoading(false);
      }
    },
    [rpcUrl, chainId, getManager],
  );

  // ── Reset ──────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  // ── Return ─────────────────────────────────────────────────────

  return { result, loading, error, simulate, reset };
}
