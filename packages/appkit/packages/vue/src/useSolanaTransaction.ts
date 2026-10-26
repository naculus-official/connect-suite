import type { SolanaConfirmationStatus } from "@naculus/connect-core";
import type { MaybeRef, ShallowRef } from "vue";
import { shallowRef, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export type SolanaTransaction = Uint8Array | string;
export type SignSolanaTransactionAction = (
  transaction: SolanaTransaction,
) => Promise<Uint8Array>;
export type SendSolanaTransactionAction = (
  transaction: SolanaTransaction,
) => Promise<string>;
export type GetSolanaTransactionStatusAction = (
  signature: string,
) => Promise<{ status: SolanaConfirmationStatus; error: string | null }>;

export interface UseSolanaTransactionOptions {
  signTransaction: MaybeRef<SignSolanaTransactionAction>;
  sendTransaction: MaybeRef<SendSolanaTransactionAction>;
  getStatus: MaybeRef<GetSolanaTransactionStatusAction>;
}

export interface UseSolanaTransactionReturn {
  signTransaction: SignSolanaTransactionAction;
  sendTransaction: SendSolanaTransactionAction;
  getStatus: GetSolanaTransactionStatusAction;
  isSigning: ShallowRef<boolean>;
  isSending: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  reset: () => void;
}

/** Reactive state around caller-owned Solana sign, send, and status actions. */
export function useSolanaTransaction(
  options: UseSolanaTransactionOptions,
): UseSolanaTransactionReturn {
  // One guard so sign and send share the "newest failure wins" error, with
  // per-channel busy flags derived from their own in-flight counts.
  const guard = useActionGuard();
  const isSigning = shallowRef(false);
  const isSending = shallowRef(false);
  let signing = 0;
  let sending = 0;

  const signTransaction: SignSolanaTransactionAction = (transaction) => {
    const invoke = unref(options.signTransaction);
    signing++;
    isSigning.value = true;
    return guard
      .run(() => invoke(transaction), "Signing failed")
      .finally(() => {
        signing--;
        isSigning.value = signing > 0;
      });
  };

  const sendTransaction: SendSolanaTransactionAction = (transaction) => {
    const invoke = unref(options.sendTransaction);
    sending++;
    isSending.value = true;
    return guard
      .run(() => invoke(transaction), "Send failed")
      .finally(() => {
        sending--;
        isSending.value = sending > 0;
      });
  };

  const getStatus: GetSolanaTransactionStatusAction = (signature) =>
    unref(options.getStatus)(signature);

  return {
    signTransaction,
    sendTransaction,
    getStatus,
    isSigning,
    isSending,
    error: guard.error,
    reset: guard.reset,
  };
}
