import { resolveSimulationEndpoint } from "@naculus/connect-appkit-core";
import {
  SimulationManager,
  type SimulationResult,
} from "@naculus/connect-core";
import type { MaybeRef, ShallowRef } from "vue";
import { shallowRef, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseSimulateTransferOptions {
  rpcUrl?: MaybeRef<string | undefined>;
  chainId?: MaybeRef<number | undefined>;
}

export interface UseSimulateTransferReturn {
  result: ShallowRef<SimulationResult | null>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  simulate: (
    tokenAddress: `0x${string}`,
    from: `0x${string}`,
    to: `0x${string}`,
    amount: string,
    options?: { chainId?: number; rpcUrl?: string; decimals?: number },
  ) => Promise<SimulationResult>;
  reset: () => void;
}

/** Vue state shell around the canonical connect-core ERC-20 simulator. */
export function useSimulateTransfer(
  options: UseSimulateTransferOptions = {},
): UseSimulateTransferReturn {
  // loading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const result = shallowRef<SimulationResult | null>(null);
  const loading = shallowRef(false);
  let manager: SimulationManager | undefined;

  // Async so a throw from the synchronous loading write still rejects.
  const simulate: UseSimulateTransferReturn["simulate"] = async (
    tokenAddress,
    from,
    to,
    amount,
    callOptions,
  ) => {
    loading.value = true;
    return await guard.run(
      async (commit) => {
        const fallbackRpcUrl = unref(options.rpcUrl);
        const endpoint = resolveSimulationEndpoint(
          callOptions?.chainId,
          unref(options.chainId),
          callOptions?.rpcUrl,
          fallbackRpcUrl,
        );
        manager ??= new SimulationManager({
          enabled: true,
          rpcUrl: fallbackRpcUrl,
          autoSimulate: false,
        });
        const value = await manager.simulateERC20Transfer(
          tokenAddress,
          from,
          to,
          amount,
          endpoint.chainId,
          callOptions?.decimals,
          endpoint.rpcUrl,
        );
        commit(() => {
          result.value = value;
        });
        return value;
      },
      "Simulation failed",
      (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      {
        onSettled: () => {
          loading.value = false;
        },
      },
    );
  };

  const reset = (): void => {
    guard.reset();
    result.value = null;
    loading.value = false;
  };

  return { result, loading, error: guard.error, simulate, reset };
}
