import {
  applySettlementVerification,
  DEFAULT_VERIFY_RETRY,
  describePayment,
  type PaymentFetch,
  type PaymentFetchResult,
  type PaymentRecord,
  type VerifyRetryOptions,
} from "@naculus/connect-appkit-core";
import type { SettlementVerification } from "@naculus/connect-core";
import type { MaybeRef, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UsePaymentFetchReturn {
  /** Fetch through the paying fetch; resolves to its full result. */
  payFetch: PaymentFetch;
  /** True while any request is in flight. */
  isPending: ShallowRef<boolean>;
  /**
   * The most recently completed payment. Every paid request is recorded, in
   * completion order, until `reset()`.
   */
  lastPayment: ShallowRef<PaymentRecord | null>;
  error: ShallowRef<Error | null>;
  reset: () => void;
}

export interface UsePaymentFetchOptions {
  verify?: (result: PaymentFetchResult) => Promise<SettlementVerification>;
  verifyRetry?: VerifyRetryOptions;
}

/**
 * Reactive state around a caller-owned paying fetch — `createX402Fetch`
 * (`@naculus/payments-x402`) or `createMppFetch` (`@naculus/payments-mpp`),
 * built with the session key and limits the app chooses. What may be paid is
 * decided there and by the session key's policy, not here.
 */
export function usePaymentFetch(
  pay: MaybeRef<PaymentFetch>,
  options: UsePaymentFetchOptions = {},
): UsePaymentFetchReturn {
  const guard = useActionGuard();
  const lastPayment = shallowRef<PaymentRecord | null>(null);
  // A payment is money spent: any paid request records it, not only the
  // newest. Only reset() and disposal stop older requests from recording.
  let epoch = 0;
  let verification = 0;
  onScopeDispose(() => {
    epoch++;
    verification++;
  });

  const payFetch: PaymentFetch = (input, init) => {
    const invoke = unref(pay);
    const own = epoch;
    return guard.run(async (): Promise<PaymentFetchResult> => {
      const result = await invoke(input, init);
      let payment = describePayment(input, result);
      if (payment && own === epoch) {
        const verify = options.verify;
        if (!verify) {
          lastPayment.value = payment;
        } else {
          payment = applySettlementVerification(payment, { status: "pending" });
          lastPayment.value = payment;
          const verificationOwn = ++verification;
          const retry = options.verifyRetry ?? DEFAULT_VERIFY_RETRY;
          void Promise.resolve().then(async () => {
            let outcome: SettlementVerification = { status: "pending" };
            for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
              if (attempt > 0) {
                await new Promise((resolve) =>
                  setTimeout(resolve, retry.delayMs),
                );
              }
              if (own !== epoch || verificationOwn !== verification) return;
              try {
                outcome = await verify(result);
              } catch (cause) {
                outcome = {
                  status: "unavailable",
                  reason:
                    cause instanceof Error
                      ? cause.message
                      : "Settlement verification failed",
                };
              }
              if (outcome.status !== "pending") break;
            }
            if (own === epoch && verificationOwn === verification) {
              const current = lastPayment.value;
              if (current)
                lastPayment.value = applySettlementVerification(
                  current,
                  outcome,
                );
            }
          });
        }
      }
      return result;
    }, "Paid request failed");
  };

  return {
    payFetch,
    isPending: guard.busy,
    lastPayment,
    error: guard.error,
    reset: () => {
      epoch++;
      verification++;
      guard.reset();
      lastPayment.value = null;
    },
  };
}
