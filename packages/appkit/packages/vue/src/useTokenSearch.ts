import { eip155ChainIdToNumber } from "@naculus/connect-appkit-core";
import {
  TokenListManager,
  type TokenSearchResult,
} from "@naculus/connect-core";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, watch } from "vue";

const DEBOUNCE_MS = 300;
const EMPTY: TokenSearchResult = { exact: [], fuzzy: [], hasMore: false };

export interface UseTokenSearchOptions {
  /** Reuse a caller-owned manager; otherwise one shared instance per page. */
  manager?: TokenListManager;
  /** Debounce in ms (default 300). */
  debounceMs?: number;
  /** Max results per bucket (default 20). */
  limit?: number;
}

export interface UseTokenSearchReturn {
  results: ShallowRef<TokenSearchResult>;
  /** True from the first keystroke until the debounced search has run. */
  isSearching: ShallowRef<boolean>;
}

// One manager per page, as in React: the first search kicks off the default
// list load in the background and later searches reuse it.
let sharedManager: TokenListManager | null = null;
function getSharedManager(): TokenListManager {
  if (!sharedManager) {
    sharedManager = new TokenListManager();
    sharedManager.load().catch(() => {});
  }
  return sharedManager;
}

/**
 * Debounced token search by symbol, name or address, mirroring the React
 * hook. Matching lives in `TokenListManager.search`; this file only debounces
 * and keeps a late timer from writing after the query moved on.
 */
export function useTokenSearch(
  query: MaybeRefOrGetter<string | null | undefined>,
  chainId?: MaybeRefOrGetter<string | null | undefined>,
  options: UseTokenSearchOptions = {},
): UseTokenSearchReturn {
  const results = shallowRef<TokenSearchResult>(EMPTY);
  const isSearching = shallowRef(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  watch(
    [() => (toValue(query) ?? "").trim(), () => toValue(chainId)],
    ([q, id]) => {
      clear();
      if (!q) {
        results.value = EMPTY;
        isSearching.value = false;
        return;
      }
      isSearching.value = true;
      timer = setTimeout(() => {
        timer = null;
        const manager = options.manager ?? getSharedManager();
        const numeric = id ? eip155ChainIdToNumber(id) : undefined;
        results.value = manager.search(q, {
          chainId: numeric,
          limit: options.limit ?? 20,
        });
        isSearching.value = false;
      }, options.debounceMs ?? DEBOUNCE_MS);
    },
    { immediate: true },
  );

  onScopeDispose(clear);

  return { results, isSearching };
}
