/**
 * useUserOpStatus
 *
 * React hook for tracking ERC-4337 UserOperation lifecycle.
 * Polls the bundler for UserOperation receipt and reports status transitions.
 *
 * @example
 * ```tsx
 * const { userOpHash, status, receipt, error } = useUserOpStatus({
 *   userOpHash: "0x...",
 *   bundlerUrl: "https://api.pimlico.io/v2/1/rpc?apikey=...",
 *   pollInterval: 2000,
 * });
 *
 * if (status === "confirmed") {
 *   console.log("UserOp included in block!");
 * }
 * ```
 */

import {
  fetchUserOperationReceipt,
  InvalidUserOperationReceiptError,
} from "@naculus/connect-appkit-core";
import type { Hex, UserOperationReceipt } from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";

export type UserOpStatus =
  | "idle"
  | "pending"
  | "confirmed"
  | "failed"
  | "not_found";

export interface UseUserOpStatusOptions {
  /** The UserOperation hash to track */
  userOpHash?: Hex | null;
  /** Bundler RPC URL */
  bundlerUrl?: string;
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Maximum number of retries (default: 30) */
  maxRetries?: number;
  /** Auto-start polling when userOpHash is provided */
  autoStart?: boolean;
}

export interface UseUserOpStatusReturn {
  /** Current status of the UserOperation */
  status: UserOpStatus;
  /** UserOperation receipt (available when confirmed or failed) */
  receipt: UserOperationReceipt | null;
  /** The userOpHash being tracked */
  userOpHash: Hex | null;
  /** Error state */
  error: Error | null;
  /** Whether polling is active */
  isPolling: boolean;
  /** Time elapsed since tracking started (ms) */
  elapsedMs: number;
  /** Number of poll attempts made */
  attempts: number;
  /** Start tracking a UserOperation */
  start: (hash: Hex) => void;
  /** Stop tracking */
  stop: () => void;
  /** Reset state */
  reset: () => void;
}

export function useUserOpStatus(
  options?: UseUserOpStatusOptions,
): UseUserOpStatusReturn {
  const bundlerUrl = options?.bundlerUrl;
  const pollInterval = options?.pollInterval ?? 2000;
  const maxRetries = options?.maxRetries ?? 30;

  const [status, setStatus] = useState<UserOpStatus>("idle");
  const [receipt, setReceipt] = useState<UserOperationReceipt | null>(null);
  const [userOpHash, setUserOpHash] = useState<Hex | null>(
    options?.userOpHash ?? null,
  );
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const startTimeRef = useRef<number>(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestGenerationRef = useRef(0);
  const attemptsRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Poll the bundler for receipt
  const poll = useCallback(
    async (hash: Hex, generation: number) => {
      if (!bundlerUrl || generation !== requestGenerationRef.current) return;

      const currentAttempt = attemptsRef.current + 1;
      attemptsRef.current = currentAttempt;
      setAttempts(currentAttempt);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const finishUnavailable = (nextError: Error): void => {
        if (generation !== requestGenerationRef.current) return;
        setStatus("not_found");
        setIsPolling(false);
        clearTimers();
        setError(nextError);
      };

      const retryOrFinish = (nextError: Error): void => {
        if (generation !== requestGenerationRef.current) return;
        if (currentAttempt <= maxRetries) {
          pollTimerRef.current = setTimeout(
            () => void poll(hash, generation),
            pollInterval,
          );
          return;
        }
        finishUnavailable(nextError);
      };

      try {
        const receiptData = await fetchUserOperationReceipt(
          bundlerUrl,
          hash,
          controller.signal,
        );
        if (generation !== requestGenerationRef.current) return;
        if (receiptData) {
          setReceipt(receiptData);
          setStatus(receiptData.success ? "confirmed" : "failed");
          setIsPolling(false);
          clearTimers();
          return;
        }
        setStatus("pending");
        retryOrFinish(
          new Error("UserOperation not included after maximum retries"),
        );
      } catch (networkError) {
        if (
          generation !== requestGenerationRef.current ||
          controller.signal.aborted
        ) {
          return;
        }
        const nextError =
          networkError instanceof Error
            ? networkError
            : new Error("Unknown bundler response failure");
        if (nextError instanceof InvalidUserOperationReceiptError) {
          finishUnavailable(nextError);
          return;
        }
        retryOrFinish(
          new Error(
            `UserOperation status unavailable after ${currentAttempt} attempt${currentAttempt === 1 ? "" : "s"}: ${nextError.message}`,
          ),
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [bundlerUrl, pollInterval, maxRetries, clearTimers],
  );

  // Start tracking
  const start = useCallback(
    (hash: Hex) => {
      requestGenerationRef.current += 1;
      const generation = requestGenerationRef.current;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearTimers();
      setUserOpHash(hash);
      setReceipt(null);
      setError(null);
      attemptsRef.current = 0;
      setAttempts(0);
      setElapsedMs(0);
      startTimeRef.current = Date.now();

      if (!bundlerUrl) {
        setStatus("not_found");
        setIsPolling(false);
        setError(new Error("Bundler URL not configured"));
        return;
      }

      setStatus("pending");
      setIsPolling(true);

      // Start elapsed timer
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 1000);

      // Start polling
      void poll(hash, generation);
    },
    [bundlerUrl, clearTimers, poll],
  );

  // Stop tracking
  const stop = useCallback(() => {
    requestGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimers();
    setIsPolling(false);
  }, [clearTimers]);

  // Reset state
  const reset = useCallback(() => {
    requestGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimers();
    setUserOpHash(null);
    setStatus("idle");
    setReceipt(null);
    setError(null);
    setIsPolling(false);
    attemptsRef.current = 0;
    setAttempts(0);
    setElapsedMs(0);
  }, [clearTimers]);

  // Auto-start whenever a userOpHash is provided: at mount, or later when
  // the hash arrives after sending (the usual case). This ran only on mount,
  // so a hash passed after the first render was never tracked.
  const autoHash = options?.userOpHash ?? null;
  const autoStart = options?.autoStart !== false;
  useEffect(() => {
    if (autoHash && autoStart) start(autoHash);
  }, [autoHash, autoStart, start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      requestGenerationRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      clearTimers();
    };
  }, [clearTimers]);

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
