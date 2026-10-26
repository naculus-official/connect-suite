import { eip155ChainIdToNumber } from "@naculus/connect-appkit-core";
import {
  TokenListManager,
  type TokenListEntry,
  type TokenListManagerConfig,
  type TokenListSource,
} from "@naculus/connect-core";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import { shallowRef, toValue, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface UseTokenListOptions {
  /** Load on creation (default: true). */
  autoLoad?: boolean;
  /** Custom sources; the manager's defaults otherwise. */
  sources?: TokenListSource[];
  /** Reuse a caller-owned manager instead of creating one. */
  manager?: TokenListManager;
}

export interface UseTokenListReturn {
  /** Tokens for the given chain, or all chains when none is given. */
  tokens: ShallowRef<TokenListEntry[]>;
  isLoading: ShallowRef<boolean>;
  /** True once a load has completed at least once. */
  isLoaded: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  /** Force a refresh from all sources. */
  refetch: () => Promise<void>;
}

/**
 * Token list for a chain, mirroring the React hook. The list logic, caching
 * and chain filtering are `TokenListManager`'s; this file is Vue plumbing.
 * The chain id is CAIP-2; a non-EVM chain yields the unfiltered list rather
 * than a bogus numeric filter.
 */
export function useTokenList(
  chainId?: MaybeRefOrGetter<string | null | undefined>,
  options: UseTokenListOptions = {},
): UseTokenListReturn {
  const config: Partial<TokenListManagerConfig> = {};
  if (options.sources) config.sources = options.sources;
  const manager = options.manager ?? new TokenListManager(config);

  // isLoading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const tokens = shallowRef<TokenListEntry[]>([]);
  const isLoading = shallowRef(options.autoLoad !== false);
  const isLoaded = shallowRef(false);

  const select = (): TokenListEntry[] => {
    const id = toValue(chainId);
    const numeric = id ? eip155ChainIdToNumber(id) : undefined;
    return manager.getTokens(
      numeric !== undefined ? { chainId: numeric } : undefined,
    );
  };

  const run = async (op: () => Promise<unknown>): Promise<void> => {
    isLoading.value = true;
    await guard
      .run(
        async (commit) => {
          await op();
          commit(() => {
            tokens.value = select();
            isLoaded.value = true;
          });
        },
        "Token list load failed",
        (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        {
          onSettled: () => {
            isLoading.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    () => toValue(chainId),
    () => {
      if (options.autoLoad !== false) void run(() => manager.load());
    },
    { immediate: true },
  );

  return {
    tokens,
    isLoading,
    isLoaded,
    error: guard.error,
    refetch: () => run(() => manager.refresh()),
  };
}
