import type {
  CompareCosts,
  CompareCostsInput,
  CostComparison,
} from "@naculus/connect-appkit-core";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useCompareCosts } from "./useCompareCosts";

function comparison(chain: string): CostComparison {
  return {
    chain,
    chainName: chain,
    totalCost: "1",
    gasCost: "1",
    estimatedTimeMs: 1,
  } as CostComparison;
}

/** Let settled promises and the guard's bookkeeping run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useCompareCosts (Vue) stale results", () => {
  it("keeps the newest comparison when an older request resolves last", async () => {
    const answers: Array<(rows: CostComparison[]) => void> = [];
    const compare = vi.fn(
      () =>
        new Promise<CostComparison[]>((resolve) => {
          answers.push(resolve);
        }),
    );
    const { api, scope } = inScope(() =>
      useCompareCosts({ operation: "swap", chains: ["eip155:1"] }, compare),
    );

    const callA = api.refresh();
    const callB = api.refresh();
    const newest = [comparison("eip155:10")];
    answers[2]!(newest);
    await callB;
    answers[1]!([comparison("eip155:1")]);
    answers[0]!([comparison("eip155:1")]);
    await callA;
    expect(api.comparisons.value).toBe(newest);
    expect(api.loading.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing after disposal", async () => {
    const answers: Array<(rows: CostComparison[]) => void> = [];
    const compare = vi.fn(
      () =>
        new Promise<CostComparison[]>((resolve) => {
          answers.push(resolve);
        }),
    );
    const { api, scope } = inScope(() =>
      useCompareCosts({ operation: "swap", chains: ["eip155:1"] }, compare),
    );
    const call = api.refresh();
    scope.stop();
    answers[0]!([comparison("eip155:1")]);
    answers[1]!([comparison("eip155:1")]);
    await call;
    expect(api.comparisons.value).toEqual([]);
    expect(api.loading.value).toBe(true);
  });
});

describe("useCompareCosts (Vue) input that permits no request", () => {
  function deferredComparisons() {
    const answers: Array<{
      resolve: (rows: CostComparison[]) => void;
      reject: (cause: Error) => void;
    }> = [];
    const compare = vi.fn(
      () =>
        new Promise<CostComparison[]>((resolve, reject) => {
          answers.push({ resolve, reject });
        }),
    );
    return { answers, compare };
  }

  it("drops a late result once the chains are removed", async () => {
    const { answers, compare } = deferredComparisons();
    const input = ref<CompareCostsInput>({
      operation: "swap",
      chains: ["eip155:1"],
    });
    const { api, scope } = inScope(() => useCompareCosts(input, compare));
    expect(api.loading.value).toBe(true);

    input.value = { operation: "swap", chains: [] };
    await nextTick();
    expect(api.loading.value).toBe(false);
    expect(api.comparisons.value).toEqual([]);

    answers[0]!.resolve([comparison("eip155:1")]);
    await flush();
    expect(api.comparisons.value).toEqual([]);
    expect(api.error.value).toBeNull();
    expect(api.loading.value).toBe(false);
    scope.stop();
  });

  it("drops a late failure once the chains are removed", async () => {
    const { answers, compare } = deferredComparisons();
    const input = ref<CompareCostsInput>({
      operation: "swap",
      chains: ["eip155:1"],
    });
    const { api, scope } = inScope(() => useCompareCosts(input, compare));

    input.value = { operation: "swap", chains: [] };
    await nextTick();
    expect(api.loading.value).toBe(false);

    answers[0]!.reject(new Error("stale"));
    await flush();
    expect(api.comparisons.value).toEqual([]);
    expect(api.error.value).toBeNull();
    expect(api.loading.value).toBe(false);
    scope.stop();
  });

  it("stops loading without a compare function and keeps the last rows", async () => {
    const { answers, compare } = deferredComparisons();
    const fn = ref<CompareCosts | null>(compare);
    const { api, scope } = inScope(() =>
      useCompareCosts({ operation: "swap", chains: ["eip155:1"] }, fn),
    );
    const shown = [comparison("eip155:1")];
    answers[0]!.resolve(shown);
    await flush();
    expect(api.comparisons.value).toBe(shown);

    const callA = api.refresh();
    expect(api.loading.value).toBe(true);
    fn.value = null;
    await nextTick();
    expect(api.loading.value).toBe(false);
    expect(api.comparisons.value).toBe(shown);

    answers[1]!.reject(new Error("stale"));
    await callA;
    expect(api.comparisons.value).toBe(shown);
    expect(api.error.value).toBeNull();
    expect(api.loading.value).toBe(false);
    scope.stop();
  });

  it("keeps the visible error when the chains are removed", async () => {
    const input = ref<CompareCostsInput>({
      operation: "swap",
      chains: ["eip155:1"],
    });
    const { api, scope } = inScope(() =>
      useCompareCosts(input, () => Promise.reject(new Error("no quote"))),
    );
    await flush();
    const visible = api.error.value;
    expect(visible?.message).toBe("no quote");

    input.value = { operation: "swap", chains: [] };
    await nextTick();
    expect(api.error.value).toBe(visible);
    expect(api.loading.value).toBe(false);
    scope.stop();
  });

  it("keeps B when A resolves after B for changed chains", async () => {
    const { answers, compare } = deferredComparisons();
    const input = ref<CompareCostsInput>({
      operation: "swap",
      chains: ["eip155:1"],
    });
    const { api, scope } = inScope(() => useCompareCosts(input, compare));

    input.value = { operation: "swap", chains: ["eip155:10"] };
    await nextTick();
    expect(compare).toHaveBeenCalledTimes(2);
    const newest = [comparison("eip155:10")];
    answers[1]!.resolve(newest);
    await flush();
    answers[0]!.resolve([comparison("eip155:1")]);
    await flush();
    expect(api.comparisons.value).toBe(newest);
    expect(api.error.value).toBeNull();
    expect(api.loading.value).toBe(false);
    scope.stop();
  });
});
