import type { ComputedRef, MaybeRef, ShallowRef } from "vue";
import { computed, shallowRef, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface EvmTransaction {
  to: string;
  from?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  nonce?: string;
  chainId?: number;
}

export type SendTransactionAction = (
  transaction: EvmTransaction,
) => Promise<string>;

export type SendTransactionStatus =
  | "idle"
  | "awaiting_approval"
  | "submitted"
  | "failed";

export interface UseSendTransactionReturn {
  sendTransaction: SendTransactionAction;
  status: ShallowRef<SendTransactionStatus>;
  error: ShallowRef<Error | null>;
  reset: () => void;
  isSending: ComputedRef<boolean>;
}

/** Reactive state around a caller-owned EVM transaction action. */
export function useSendTransaction(
  action: MaybeRef<SendTransactionAction>,
): UseSendTransactionReturn {
  const guard = useActionGuard();
  const status = shallowRef<SendTransactionStatus>("idle");

  const sendTransaction: SendTransactionAction = (transaction) => {
    const invoke = unref(action);
    status.value = "awaiting_approval";
    return guard
      .run(async (commit) => {
        const hash = await invoke(transaction);
        commit(() => {
          status.value = "submitted";
        });
        return hash;
      }, "Transaction failed")
      .catch((cause: unknown) => {
        // The guard already published the error if this call is current;
        // status follows the same rule.
        if (guard.error.value === cause) status.value = "failed";
        throw cause;
      });
  };

  const reset = (): void => {
    guard.reset();
    status.value = "idle";
  };

  return {
    sendTransaction,
    status,
    error: guard.error,
    reset,
    isSending: computed(() => status.value === "awaiting_approval"),
  };
}
