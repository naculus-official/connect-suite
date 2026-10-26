import { bareEvmAddress } from "@naculus/connect-appkit-core";
import { ERC20_MIN_ABI, formatUnits } from "@naculus/connect-core";
import type { MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface TokenInfo {
  /** ERC-20 token contract address */
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  name?: string;
}

/** Minimal read-only contract; a viem PublicClient satisfies it. */
export interface TokenBalanceReader {
  readContract(args: {
    address: `0x${string}`;
    abi: typeof ERC20_MIN_ABI;
    functionName: "balanceOf";
    args: readonly [`0x${string}`];
  }): Promise<unknown>;
}

export interface TokenBalanceResult extends TokenInfo {
  /** Raw balance in the smallest unit as a decimal string, or null if unread. */
  balance: string | null;
  /** Human-readable balance, or null if unread. */
  formatted: string | null;
}

export interface UseTokenBalanceOptions {
  /** Auto-refresh interval in milliseconds. Default: no auto-refresh. */
  refreshInterval?: MaybeRefOrGetter<number | null | undefined>;
}

export interface UseTokenBalanceReturn {
  tokenBalances: ShallowRef<TokenBalanceResult[]>;
  isFetching: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refetch: () => Promise<void>;
  getTokenBalance: (
    tokenAddress: `0x${string}`,
  ) => TokenBalanceResult | undefined;
}

function tokensKey(tokens: readonly TokenInfo[]): string {
  return tokens
    .map((t) => `${t.address.toLowerCase()}|${t.decimals}|${t.symbol}`)
    .join(",");
}

/**
 * ERC-20 balances of an EVM account through a caller-owned reader.
 *
 * Mirrors the React hook: one token failing to read leaves that entry with a
 * null balance and does not fail the others. A late response for a previous
 * account, reader or token list is dropped.
 */
export function useTokenBalance(
  account: MaybeRefOrGetter<string | null | undefined>,
  client: MaybeRefOrGetter<TokenBalanceReader | null | undefined>,
  tokens: MaybeRefOrGetter<readonly TokenInfo[] | null | undefined>,
  options: UseTokenBalanceOptions = {},
): UseTokenBalanceReturn {
  // The guard owns generation, disposal and error. isFetching stays
  // newest-only (cleared via onSettled), not the guard's counted busy flag.
  const guard = useActionGuard();
  const tokenBalances = shallowRef<TokenBalanceResult[]>([]);
  const isFetching = shallowRef(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const refetch = async (): Promise<void> => {
    const reader = toValue(client);
    const address = bareEvmAddress(toValue(account));
    const list = toValue(tokens) ?? [];
    if (!reader || !address || list.length === 0) {
      guard.reset();
      tokenBalances.value = [];
      isFetching.value = false;
      return;
    }
    isFetching.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            const results = await Promise.all(
              list.map(async (token): Promise<TokenBalanceResult> => {
                try {
                  const raw = await reader.readContract({
                    address: token.address,
                    abi: ERC20_MIN_ABI,
                    functionName: "balanceOf",
                    args: [address],
                  });
                  const value = BigInt(raw as bigint | string | number);
                  return {
                    ...token,
                    balance: value.toString(),
                    formatted: formatUnits(value, token.decimals),
                  };
                } catch {
                  return { ...token, balance: null, formatted: null };
                }
              }),
            );
            commit(() => {
              tokenBalances.value = results;
            });
          } catch (cause) {
            commit(() => {
              tokenBalances.value = [];
            });
            throw cause;
          }
        },
        "Failed to fetch token balances",
        undefined,
        {
          onSettled: () => {
            isFetching.value = false;
          },
        },
      )
      .catch(() => {});
  };

  const stopTimer = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  // Multi-source form: Vue compares each source by value, so a new token
  // array with the same content does not trigger a re-read.
  watch(
    [
      () => toValue(account),
      () => toValue(client),
      () => tokensKey(toValue(tokens) ?? []),
      () => toValue(options.refreshInterval) ?? 0,
    ],
    ([, , , interval]) => {
      stopTimer();
      void refetch();
      if (interval > 0) timer = setInterval(() => void refetch(), interval);
    },
    { immediate: true },
  );

  onScopeDispose(stopTimer);

  return {
    tokenBalances,
    isFetching,
    error: guard.error,
    refetch,
    getTokenBalance: (tokenAddress) =>
      tokenBalances.value.find(
        (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
      ),
  };
}
