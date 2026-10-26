import { describe, expect, it, vi } from "vitest";
import { nextTick, ref, watch } from "vue";
import { inScope } from "../test-utils/scope";
import { useBalance } from "./useBalance";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useBalance (Vue)", () => {
  it("reads and formats a native balance, accepting a CAIP-10 account", async () => {
    const client = {
      getBalance: vi.fn(async () => 1_500_000_000_000_000_000n),
    };
    const { api } = inScope(() =>
      useBalance(`eip155:1:${ADDRESS}`, client, { symbol: "ETH" }),
    );
    await vi.waitFor(() => expect(api.balance.value).not.toBeNull());
    expect(api.balance.value).toBe("1500000000000000000");
    expect(api.formatted.value).toBe("1.5");
    expect(api.symbol.value).toBe("ETH");
    expect(client.getBalance).toHaveBeenCalledWith({ address: ADDRESS });
  });

  it("does not read without an account or a client, and clears on error", async () => {
    const getBalance = vi.fn(async () => 1n);
    const client = ref<{ getBalance: typeof getBalance } | null>(null);
    const { api } = inScope(() => useBalance(ADDRESS, client));
    await nextTick();
    expect(getBalance).not.toHaveBeenCalled();
    expect(api.balance.value).toBeNull();
    expect(api.symbol.value).toBeNull();

    client.value = { getBalance };
    await vi.waitFor(() => expect(api.balance.value).toBe("1"));

    getBalance.mockRejectedValueOnce(new Error("rpc down"));
    await api.refetch();
    expect(api.balance.value).toBeNull();
    expect(api.error.value?.message).toBe("rpc down");
    expect(api.isFetching.value).toBe(false);
  });

  it("drops a late result from a previous account and stops after dispose", async () => {
    const first = deferred<bigint>();
    const getBalance = vi
      .fn<(args: { address: `0x${string}` }) => Promise<bigint>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(7n);
    const account = ref<string>(ADDRESS);
    const { api, scope } = inScope(() => useBalance(account, { getBalance }));
    account.value = OTHER;
    await vi.waitFor(() => expect(api.balance.value).toBe("7"));
    first.resolve(999n);
    await nextTick();
    expect(api.balance.value).toBe("7");

    scope.stop();
    getBalance.mockResolvedValueOnce(42n);
    await api.refetch();
    expect(api.balance.value).toBe("7");
  });

  it("auto-refreshes on the given interval and clears it on dispose", async () => {
    vi.useFakeTimers();
    try {
      const getBalance = vi.fn(async () => 1n);
      const { scope } = inScope(() =>
        useBalance(ADDRESS, { getBalance }, { refreshInterval: 1_000 }),
      );
      await vi.advanceTimersByTimeAsync(2_500);
      expect(getBalance).toHaveBeenCalledTimes(3);
      scope.stop();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(getBalance).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the newest refetch when an older one resolves last", async () => {
    const reads: Array<ReturnType<typeof deferred<bigint>>> = [];
    const getBalance = vi.fn(() => {
      const read = deferred<bigint>();
      reads.push(read);
      return read.promise;
    });
    const { api, scope } = inScope(() => useBalance(ADDRESS, { getBalance }));

    const callA = api.refetch();
    const callB = api.refetch();
    reads[2]!.resolve(2n);
    await callB;
    reads[1]!.resolve(1n);
    reads[0]!.resolve(0n);
    await callA;
    expect(api.balance.value).toBe("2");
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("clears isFetching only once a failure's error is visible", async () => {
    const seen: string[] = [];
    const { api, scope } = inScope(() => {
      const state = useBalance(ADDRESS, {
        getBalance: () => Promise.reject(new Error("boom")),
      });
      const record = (flush: string) => (busy: boolean) => {
        if (!busy) seen.push(`${flush}:${state.error.value?.message ?? null}`);
      };
      watch(state.isFetching, record("sync"), { flush: "sync" });
      watch(state.isFetching, record("pre"));
      return state;
    });
    await vi.waitFor(() => expect(api.isFetching.value).toBe(false));
    await nextTick();
    expect(seen).toEqual(["sync:boom", "pre:boom"]);
    scope.stop();
  });

  it("ignores an older failure and settlement while a newer read is in flight", async () => {
    const reads: Array<ReturnType<typeof deferred<bigint>>> = [];
    const getBalance = vi.fn(() => {
      const read = deferred<bigint>();
      reads.push(read);
      return read.promise;
    });
    const { api, scope } = inScope(() => useBalance(ADDRESS, { getBalance }));

    const callA = api.refetch();
    const callB = api.refetch();
    reads[1]!.reject(new Error("stale"));
    await callA;
    // A settling must not clear B's loading flag or publish A's error.
    expect(api.isFetching.value).toBe(true);
    expect(api.error.value).toBeNull();
    reads[2]!.resolve(2n);
    await callB;
    reads[0]!.reject(new Error("initial"));
    await Promise.resolve();
    expect(api.balance.value).toBe("2");
    expect(api.error.value).toBeNull();
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });
});
