import type {
  SimulationCallClient,
  WalletChain,
} from "@naculus/connect-appkit-core";
import { chainNumber, encodeErc20Transfer } from "@naculus/connect-appkit-core";
import type { SimulationResult } from "@naculus/connect-core";
import { parseUnits, type TokenConfig } from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";
import {
  type UseTransactionSimulationReturn,
  useTransactionSimulation,
} from "./useTransactionSimulation";

export interface UseERC20TransferSimulationOptions {
  token: MaybeRefOrGetter<TokenConfig>;
  to: MaybeRefOrGetter<`0x${string}`>;
  amount: MaybeRefOrGetter<string>;
  connected: MaybeRefOrGetter<boolean>;
  evmAccount: MaybeRef<string | null | undefined>;
  currentChain?: MaybeRef<WalletChain | null | undefined>;
  publicClient?: MaybeRef<SimulationCallClient | null | undefined>;
}

export interface UseERC20TransferSimulationReturn
  extends Omit<
    UseTransactionSimulationReturn,
    "result" | "isSimulating" | "error" | "simulate"
  > {
  result: ComputedRef<SimulationResult | undefined>;
  isSimulating: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
  reSimulate: () => Promise<SimulationResult>;
}

/** Vue shell that previews exactly the calldata accepted by the transfer hook. */
export function useERC20TransferSimulation(
  options: UseERC20TransferSimulationOptions,
): UseERC20TransferSimulationReturn {
  const transaction = computed(() => {
    const token = toValue(options.token);
    if (!toValue(options.connected) || !toValue(options.evmAccount))
      return undefined;
    try {
      if (token.decimals === undefined) return undefined;
      return {
        to: token.address,
        data: encodeErc20Transfer(
          toValue(options.to),
          parseUnits(toValue(options.amount), token.decimals),
        ),
        value: "0" as const,
      };
    } catch {
      return undefined;
    }
  });
  const chainId = computed(() => {
    const token = toValue(options.token);
    if (token.chainId !== undefined) return token.chainId;
    const currentChain = toValue(options.currentChain);
    return currentChain ? (chainNumber(currentChain) ?? undefined) : undefined;
  });
  const simulation = useTransactionSimulation(transaction, {
    chainId,
    currentChain: options.currentChain,
    publicClient: options.publicClient,
    evmAccount: options.evmAccount,
  });
  return {
    result: computed(() =>
      transaction.value ? simulation.result.value : undefined,
    ),
    isSimulating: computed(
      () => !!transaction.value && simulation.isSimulating.value,
    ),
    error: computed(() => (transaction.value ? simulation.error.value : null)),
    reSimulate: simulation.simulate,
    reset: simulation.reset,
  };
}
