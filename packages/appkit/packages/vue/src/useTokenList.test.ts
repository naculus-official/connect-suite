import type { TokenListEntry, TokenListManager } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useTokenList } from "./useTokenList";

const usdc = {
  chainId: 1,
  address: "0xa0b8",
  symbol: "USDC",
} as TokenListEntry;
const matic = {
  chainId: 137,
  address: "0x2791",
  symbol: "USDC",
} as TokenListEntry;

function fakeManager() {
  const all = [usdc, matic];
  return {
    load: vi.fn(async () => all),
    refresh: vi.fn(async () => all),
    getTokens: vi.fn((options?: { chainId?: number }) =>
      options?.chainId ? all.filter((t) => t.chainId === options.chainId) : all,
    ),
  } as unknown as TokenListManager & {
    load: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    getTokens: ReturnType<typeof vi.fn>;
  };
}

describe("useTokenList (Vue)", () => {
  it("loads once and filters by the numeric id of an EVM chain", async () => {
    const manager = fakeManager();
    const { api } = inScope(() => useTokenList("eip155:137", { manager }));
    expect(api.isLoading.value).toBe(true);
    await vi.waitFor(() => expect(api.isLoaded.value).toBe(true));
    expect(manager.getTokens).toHaveBeenCalledWith({ chainId: 137 });
    expect(api.tokens.value).toEqual([matic]);
    expect(api.isLoading.value).toBe(false);
  });

  it("does not derive a bogus numeric filter from a Solana chain id", async () => {
    const manager = fakeManager();
    const { api } = inScope(() =>
      useTokenList("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", { manager }),
    );
    await vi.waitFor(() => expect(api.isLoaded.value).toBe(true));
    expect(manager.getTokens).toHaveBeenCalledWith(undefined);
    expect(api.tokens.value).toHaveLength(2);
  });

  it("re-selects when the chain ref changes and refetches through refresh()", async () => {
    const manager = fakeManager();
    const chain = ref<string | null>("eip155:1");
    const { api } = inScope(() => useTokenList(chain, { manager }));
    await vi.waitFor(() => expect(api.tokens.value).toEqual([usdc]));

    chain.value = "eip155:137";
    await nextTick();
    await vi.waitFor(() => expect(api.tokens.value).toEqual([matic]));

    await api.refetch();
    expect(manager.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not load when autoLoad is false, and records a failed load", async () => {
    const manager = fakeManager();
    const { api } = inScope(() =>
      useTokenList("eip155:1", { manager, autoLoad: false }),
    );
    await nextTick();
    expect(manager.load).not.toHaveBeenCalled();
    expect(api.isLoading.value).toBe(false);

    manager.refresh.mockRejectedValueOnce(new Error("offline"));
    await api.refetch();
    expect(api.error.value?.message).toBe("offline");
    expect(api.isLoaded.value).toBe(false);
  });

  it("keeps the newest refresh when an older one resolves last", async () => {
    const manager = fakeManager();
    const refreshes: Array<() => void> = [];
    manager.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          refreshes.push(resolve);
        }),
    );
    let reads = 0;
    manager.getTokens.mockImplementation(() => [
      { ...usdc, symbol: `read-${++reads}` },
    ]);
    const { api, scope } = inScope(() =>
      useTokenList("eip155:1", { manager, autoLoad: false }),
    );

    const callA = api.refetch();
    const callB = api.refetch();
    refreshes[1]!();
    await callB;
    const newest = api.tokens.value;
    expect(newest[0]?.symbol).toBe("read-1");
    refreshes[0]!();
    await callA;
    // A's completion would re-select and replace the list; it must not.
    expect(api.tokens.value).toBe(newest);
    expect(manager.getTokens).toHaveBeenCalledTimes(1);
    expect(api.isLoading.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing after disposal", async () => {
    const manager = fakeManager();
    let fail!: (cause: Error) => void;
    manager.refresh.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { api, scope } = inScope(() =>
      useTokenList("eip155:1", { manager, autoLoad: false }),
    );
    const call = api.refetch();
    scope.stop();
    fail(new Error("late"));
    await call;
    expect(api.error.value).toBeNull();
    expect(api.isLoading.value).toBe(true);
  });
});
