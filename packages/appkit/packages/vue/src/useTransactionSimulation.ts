import {
  type SimulationCallClient,
  type SimulationTransaction,
  simulateTransactionPreview,
  type WalletChain,
} from "@naculus/connect-appkit-core";
import type { SimulationResult } from "@naculus/connect-core";
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, unref, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseTransactionSimulationOptions {
  chainId?: MaybeRef<number | undefined>;
  currentChain?: MaybeRef<WalletChain | null | undefined>;
  publicClient?: MaybeRef<SimulationCallClient | null | undefined>;
  evmAccount?: MaybeRef<string | null | undefined>;
}

export interface UseTransactionSimulationReturn {
  result: ShallowRef<SimulationResult | undefined>;
  isSimulating: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  simulate: () => Promise<SimulationResult>;
  reset: () => void;
}

/** Basic eth_call preview; caller supplies chain/account/client context. */
export function useTransactionSimulation(
  tx: MaybeRefOrGetter<SimulationTransaction | undefined>,
  options: UseTransactionSimulationOptions = {},
): UseTransactionSimulationReturn {
  // isSimulating stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const result = shallowRef<SimulationResult | undefined>(undefined);
  const isSimulating = shallowRef(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const simulate = async (): Promise<SimulationResult> => {
    const transaction = toValue(tx);
    // Without a transaction the call still supersedes older ones and
    // publishes its ("unavailable") result, but it has never cleared the
    // visible error or touched isSimulating.
    if (transaction) isSimulating.value = true;
    return await guard.run(
      async (commit) => {
        const value = await simulateTransactionPreview(transaction, {
          chainId: unref(options.chainId),
          currentChain: unref(options.currentChain),
          publicClient: unref(options.publicClient),
          evmAccount: unref(options.evmAccount),
        });
        commit(() => {
          result.value = value;
        });
        return value;
      },
      "Simulation failed",
      undefined,
      {
        keepError: !transaction,
        onSettled: transaction
          ? () => {
              isSimulating.value = false;
            }
          : undefined,
      },
    );
  };

  watch(
    [
      () => toValue(tx),
      () => unref(options.chainId),
      () => unref(options.currentChain),
      () => unref(options.publicClient),
      () => unref(options.evmAccount),
    ],
    ([transaction]) => {
      // Supersede the in-flight simulation without clearing the error.
      guard.invalidate();
      if (timer) clearTimeout(timer);
      if (!transaction) {
        // Nothing left to simulate: the superseded call can no longer clear
        // the flag itself. The last result and visible error stay as they are.
        isSimulating.value = false;
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        void simulate().catch(() => {
          // Error is captured in state.
        });
      }, 300);
    },
    { immediate: true },
  );

  const reset = (): void => {
    guard.reset();
    result.value = undefined;
    isSimulating.value = false;
  };
  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
  });

  return { result, isSimulating, error: guard.error, simulate, reset };
}
