import {
  fetchUserOperationReceipt,
  InvalidUserOperationReceiptError,
} from "@naculus/connect-appkit-core";
import type { Hex, UserOperationReceipt } from "@naculus/connect-core";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue } from "vue";

export type UserOpStatus =
  | "idle"
  | "pending"
  | "confirmed"
  | "failed"
  | "not_found";

export interface UseUserOpStatusOptions {
  bundlerUrl: MaybeRefOrGetter<string | undefined>;
  /** Poll interval in ms (default 2000). */
  pollInterval?: number;
  /** Attempts before giving up as not_found (default 30). */
  maxRetries?: number;
}

export interface UseUserOpStatusReturn {
  status: ShallowRef<UserOpStatus>;
  receipt: ShallowRef<UserOperationReceipt | null>;
  userOpHash: ShallowRef<Hex | null>;
  error: ShallowRef<Error | null>;
  isPolling: ShallowRef<boolean>;
  elapsedMs: ShallowRef<number>;
  attempts: ShallowRef<number>;
  start: (hash: Hex) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Poll a bundler for a UserOperation receipt, mirroring the React hook.
 * Receipt validation is appkit-core's: a malformed receipt ends polling as
 * not_found rather than being retried or banked; transport errors retry up
 * to maxRetries. A start() or dispose aborts the in-flight request.
 */
export function useUserOpStatus(
  options: UseUserOpStatusOptions,
): UseUserOpStatusReturn {
  const status = shallowRef<UserOpStatus>("idle");
  const receipt = shallowRef<UserOperationReceipt | null>(null);
  const userOpHash = shallowRef<Hex | null>(null);
  const error = shallowRef<Error | null>(null);
  const isPolling = shallowRef(false);
  const elapsedMs = shallowRef(0);
  const attempts = shallowRef(0);
  const pollInterval = options.pollInterval ?? 2000;
  const maxRetries = options.maxRetries ?? 30;

  let generation = 0;
  let startedAt = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const clearTimers = (): void => {
    if (ticker) clearInterval(ticker);
    if (timer) clearTimeout(timer);
    ticker = null;
    timer = null;
  };

  const finish = (next: UserOpStatus, cause: Error | null): void => {
    status.value = next;
    error.value = cause;
    isPolling.value = false;
    clearTimers();
  };

  const poll = async (hash: Hex, own: number): Promise<void> => {
    const bundlerUrl = toValue(options.bundlerUrl);
    if (!bundlerUrl || own !== generation) return;
    const attempt = ++attempts.value;
    const abort = new AbortController();
    controller = abort;
    try {
      const next = await fetchUserOperationReceipt(
        bundlerUrl,
        hash,
        abort.signal,
      );
      if (own !== generation) return;
      if (next) {
        receipt.value = next;
        finish(next.success ? "confirmed" : "failed", null);
        return;
      }
      status.value = "pending";
      if (attempt <= maxRetries) {
        timer = setTimeout(() => void poll(hash, own), pollInterval);
      } else {
        finish(
          "not_found",
          new Error("UserOperation not included after maximum retries"),
        );
      }
    } catch (cause) {
      if (own !== generation || abort.signal.aborted) return;
      const next =
        cause instanceof Error
          ? cause
          : new Error("Unknown bundler response failure");
      if (next instanceof InvalidUserOperationReceiptError) {
        finish("not_found", next);
        return;
      }
      if (attempt <= maxRetries) {
        timer = setTimeout(() => void poll(hash, own), pollInterval);
      } else {
        finish(
          "not_found",
          new Error(
            `UserOperation status unavailable after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${next.message}`,
          ),
        );
      }
    } finally {
      if (controller === abort) controller = null;
    }
  };

  const start = (hash: Hex): void => {
    const own = ++generation;
    controller?.abort();
    controller = null;
    clearTimers();
    userOpHash.value = hash;
    receipt.value = null;
    error.value = null;
    attempts.value = 0;
    elapsedMs.value = 0;
    if (!toValue(options.bundlerUrl)) {
      finish("not_found", new Error("Bundler URL not configured"));
      return;
    }
    status.value = "pending";
    isPolling.value = true;
    startedAt = Date.now();
    ticker = setInterval(() => {
      elapsedMs.value = Date.now() - startedAt;
    }, 1000);
    void poll(hash, own);
  };

  const stop = (): void => {
    generation++;
    controller?.abort();
    controller = null;
    clearTimers();
    isPolling.value = false;
  };

  const reset = (): void => {
    stop();
    status.value = "idle";
    receipt.value = null;
    userOpHash.value = null;
    error.value = null;
    attempts.value = 0;
    elapsedMs.value = 0;
  };

  onScopeDispose(stop);

  return {
    status,
    receipt,
    userOpHash,
    error,
    isPolling,
    elapsedMs,
    attempts,
    start,
    stop,
    reset,
  };
}
