import {
  type GetRouteQuotes,
  isQuotableInput,
  type RouteQuote,
  type RouteQuoteInput,
} from "@naculus/connect-appkit-core";
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, unref, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseRouteQuoteOptions {
  /** Debounce before auto-fetching after an input change (default 300 ms). */
  debounceMs?: number;
}

export interface UseRouteQuoteReturn {
  quotes: ShallowRef<RouteQuote[]>;
  loading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * Debounced cross-chain route quotes through a caller-supplied quote
 * function, mirroring the React hook. Which inputs are quotable is decided
 * in appkit-core; this file debounces and drops late results.
 */
export function useRouteQuote(
  input: MaybeRefOrGetter<RouteQuoteInput>,
  getQuotes?: MaybeRef<GetRouteQuotes | null | undefined>,
  options: UseRouteQuoteOptions = {},
): UseRouteQuoteReturn {
  // loading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const quotes = shallowRef<RouteQuote[]>([]);
  const loading = shallowRef(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  // The quote function when `current` permits a request. Otherwise
  // supersede the in-flight request, stop loading and return null. The
  // visible error is kept, as before; quotes are cleared for unquotable input
  // and kept when only the quote function is missing.
  const requestable = (current: RouteQuoteInput): GetRouteQuotes | null => {
    if (!isQuotableInput(current)) {
      guard.invalidate();
      loading.value = false;
      quotes.value = [];
      return null;
    }
    const fn = unref(getQuotes);
    if (!fn) {
      guard.invalidate();
      loading.value = false;
      return null;
    }
    return fn;
  };

  const fetchQuotes = async (): Promise<void> => {
    // One snapshot: the input that is validated is the input that is quoted.
    const current = toValue(input);
    const fn = requestable(current);
    if (!fn) return;
    loading.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            const result = await fn(
              current.fromChain,
              current.toChain,
              current.fromToken,
              current.amount,
              current.options,
              current.toToken,
            );
            commit(() => {
              quotes.value = result;
            });
          } catch (cause) {
            commit(() => {
              quotes.value = [];
            });
            throw cause;
          }
        },
        "Route quote failed",
        (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        {
          onSettled: () => {
            loading.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    [
      () => toValue(input).fromChain,
      () => toValue(input).toChain,
      () => toValue(input).fromToken,
      () => toValue(input).toToken,
      () => toValue(input).amount,
      () => unref(getQuotes),
    ],
    () => {
      clearTimer();
      // Any input change supersedes the in-flight request at once, not when
      // the debounced replacement starts. Committed quotes and the visible
      // error stay; loading stays true if a request was running, until the
      // replacement settles or the input permits no request.
      guard.invalidate();
      if (!requestable(toValue(input))) return;
      timer = setTimeout(() => {
        timer = null;
        void fetchQuotes();
      }, options.debounceMs ?? 300);
    },
    { immediate: true },
  );

  onScopeDispose(clearTimer);

  return {
    quotes,
    loading,
    error: guard.error,
    refresh: fetchQuotes,
    clear: () => {
      clearTimer();
      guard.reset();
      quotes.value = [];
      loading.value = false;
    },
  };
}
