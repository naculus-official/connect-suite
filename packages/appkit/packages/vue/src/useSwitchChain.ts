import { toChainSwitchError } from "@naculus/connect-appkit-core";
import type { WalletError } from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseSwitchChainReturn {
  switchChain: (chainId: string) => Promise<void>;
  isSwitching: ShallowRef<boolean>;
  currentChainId: ComputedRef<string | null>;
  error: ShallowRef<WalletError | null>;
  clearError: () => void;
}

/** Vue counterpart of React useSwitchChain around a caller-owned action. */
export function useSwitchChain(
  action: MaybeRef<(chainId: string) => Promise<void>>,
  chainId: MaybeRefOrGetter<string | null | undefined>,
): UseSwitchChainReturn {
  const guard = useActionGuard();

  const switchChain = (targetChainId: string): Promise<void> => {
    const invoke = unref(action);
    return guard.run(async () => {
      try {
        await invoke(targetChainId);
      } catch (cause) {
        throw toChainSwitchError(cause);
      }
    }, "Failed to switch chain");
  };

  return {
    switchChain,
    isSwitching: guard.busy,
    currentChainId: computed(() => toValue(chainId) ?? null),
    error: guard.error as ShallowRef<WalletError | null>,
    clearError: guard.clearError,
  };
}
