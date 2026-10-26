import type { RouteQuote } from "@naculus/connect-appkit-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useCompareCosts } from "./useCompareCosts";
import { useExecuteRoute } from "./useExecuteRoute";
import { useRouteQuote } from "./useRouteQuote";

const quote: RouteQuote = {
  routeId: "r1",
  provider: "p",
  netReceiveFormatted: "9.9",
  toTokenSymbol: "USDC",
};

describe("useRouteQuote (Vue)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces, refuses a non-integer amount, then quotes the final input", async () => {
    const getQuotes = vi.fn(async () => [quote]);
    const input = ref({
      fromChain: "eip155:1",
      toChain: "eip155:10",
      fromToken: "USDC",
      amount: "1.5",
    });
    const { api } = inScope(() => useRouteQuote(input, getQuotes));
    await vi.advanceTimersByTimeAsync(300);
    expect(getQuotes).not.toHaveBeenCalled();
    expect(api.quotes.value).toEqual([]);

    input.value = { ...input.value, amount: "1000000" };
    await nextTick();
    await vi.advanceTimersByTimeAsync(299);
    expect(getQuotes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(api.quotes.value).toEqual([quote]));
    expect(getQuotes).toHaveBeenCalledWith(
      "eip155:1",
      "eip155:10",
      "USDC",
      "1000000",
      undefined,
      undefined,
    );
  });

  it("drops a late result after clear() and records failures", async () => {
    let release!: (q: RouteQuote[]) => void;
    const getQuotes = vi
      .fn<() => Promise<RouteQuote[]>>()
      .mockImplementationOnce(
        () =>
          new Promise<RouteQuote[]>((resolve) => {
            release = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("quote api down"));
    const { api } = inScope(() =>
      useRouteQuote(
        {
          fromChain: "eip155:1",
          toChain: "eip155:10",
          fromToken: "USDC",
          amount: "5",
        },
        getQuotes,
      ),
    );
    await vi.advanceTimersByTimeAsync(300);
    expect(api.loading.value).toBe(true);
    api.clear();
    release([quote]);
    await nextTick();
    expect(api.quotes.value).toEqual([]);
    expect(api.loading.value).toBe(false);

    await api.refresh();
    expect(api.error.value?.message).toBe("quote api down");
    expect(api.quotes.value).toEqual([]);
  });
});

describe("useCompareCosts (Vue)", () => {
  it("fetches by input value, not identity, and only the newest request writes", async () => {
    const compare = vi.fn(async (_op: string, chains: string[]) =>
      chains.map((chain) => ({
        chain,
        chainName: chain,
        totalCost: "1",
        gasCost: "1",
        estimatedTimeMs: 1,
      })),
    );
    const input = ref({ operation: "swap", chains: ["eip155:1"] });
    const { api } = inScope(() => useCompareCosts(input, compare));
    await vi.waitFor(() => expect(api.comparisons.value).toHaveLength(1));

    input.value = { operation: "swap", chains: ["eip155:1"] };
    await nextTick();
    expect(compare).toHaveBeenCalledTimes(1);

    input.value = { operation: "swap", chains: ["eip155:1", "eip155:10"] };
    await nextTick();
    await vi.waitFor(() => expect(api.comparisons.value).toHaveLength(2));
    expect(compare).toHaveBeenCalledTimes(2);

    input.value = { operation: "swap", chains: [] };
    await nextTick();
    expect(api.comparisons.value).toEqual([]);
  });
});

describe("useExecuteRoute (Vue)", () => {
  const evm = "0x1111111111111111111111111111111111111111";

  it("validates the recipient for the destination namespace and executes once", async () => {
    const executor = vi.fn(async () => ({ fromTxHash: "0xabc" }));
    const { api } = inScope(() => useExecuteRoute(executor));

    expect(
      await api.execute(
        { routeId: "r", provider: "p", toChain: "eip155:10" },
        "not-an-address",
      ),
    ).toBeNull();
    expect(api.error.value?.code).toBe("invalid_recipient");
    expect(executor).not.toHaveBeenCalled();

    const ok = await api.execute(
      { routeId: "r", provider: "p", toChain: "eip155:10" },
      evm,
    );
    expect(ok).toEqual({ fromTxHash: "0xabc" });
    expect(api.result.value).toEqual({ fromTxHash: "0xabc" });
    expect(api.error.value).toBeNull();
  });

  it("refuses a second execution while one is in flight, and reset() does not unlock it", async () => {
    let release!: (r: { fromTxHash: string }) => void;
    const executor = vi.fn(
      () =>
        new Promise<{ fromTxHash: string }>((resolve) => {
          release = resolve;
        }),
    );
    const { api } = inScope(() => useExecuteRoute(executor));
    const first = api.execute({ routeId: "r", provider: "p" }, evm);
    api.reset();
    expect(await api.execute({ routeId: "r", provider: "p" }, evm)).toBeNull();
    expect(api.error.value?.code).toBe("execution_in_progress");
    expect(executor).toHaveBeenCalledTimes(1);
    release({ fromTxHash: "0x1" });
    expect(await first).toEqual({ fromTxHash: "0x1" });
  });

  it("normalizes executor failures and reports a missing executor", async () => {
    const executor = vi.fn(async () => {
      throw Object.assign(new Error("slow"), { code: "timeout" });
    });
    const { api } = inScope(() => useExecuteRoute(executor));
    expect(await api.execute({ routeId: "r", provider: "p" }, evm)).toBeNull();
    expect(api.error.value).toMatchObject({ code: "timeout", message: "slow" });

    const none = inScope(() => useExecuteRoute(undefined)).api;
    expect(await none.execute({ routeId: "r", provider: "p" }, evm)).toBeNull();
    expect(none.error.value?.code).toBe("no_executor");
  });
});
