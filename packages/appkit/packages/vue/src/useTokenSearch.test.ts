import type {
  TokenListManager,
  TokenSearchResult,
} from "@naculus/connect-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useTokenSearch } from "./useTokenSearch";

const hit = (symbol: string): TokenSearchResult => ({
  exact: [{ token: { symbol } } as never],
  fuzzy: [],
  hasMore: false,
});

function fakeManager() {
  return {
    search: vi.fn((q: string) => hit(q.toUpperCase())),
  } as unknown as TokenListManager & { search: ReturnType<typeof vi.fn> };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTokenSearch (Vue)", () => {
  it("debounces, then searches with the numeric chain id and limit", async () => {
    const manager = fakeManager();
    const { api } = inScope(() =>
      useTokenSearch("usdc", "eip155:1", { manager }),
    );
    expect(api.isSearching.value).toBe(true);
    expect(manager.search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(manager.search).toHaveBeenCalledWith("usdc", {
      chainId: 1,
      limit: 20,
    });
    expect(api.results.value.exact).toHaveLength(1);
    expect(api.isSearching.value).toBe(false);
  });

  it("restarts the debounce on each keystroke and searches only the final query", async () => {
    const manager = fakeManager();
    const query = ref("u");
    const { api } = inScope(() =>
      useTokenSearch(query, undefined, { manager }),
    );
    await vi.advanceTimersByTimeAsync(200);
    query.value = "us";
    await nextTick();
    await vi.advanceTimersByTimeAsync(200);
    query.value = "usdc";
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(manager.search).toHaveBeenCalledTimes(1);
    expect(manager.search).toHaveBeenCalledWith("usdc", {
      chainId: undefined,
      limit: 20,
    });
    expect(api.results.value).toEqual(hit("USDC"));
  });

  it("clears results for a blank query and cancels a pending timer on dispose", async () => {
    const manager = fakeManager();
    const query = ref("dai");
    const { api, scope } = inScope(() =>
      useTokenSearch(query, undefined, { manager }),
    );
    query.value = "   ";
    await nextTick();
    expect(api.results.value).toEqual({ exact: [], fuzzy: [], hasMore: false });
    expect(api.isSearching.value).toBe(false);

    query.value = "dai";
    await nextTick();
    scope.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(manager.search).not.toHaveBeenCalled();
  });
});
