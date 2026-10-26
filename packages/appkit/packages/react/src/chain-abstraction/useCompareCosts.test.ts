/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CostComparison } from "./useCompareCosts";
import { useCompareCosts } from "./useCompareCosts";

/**
 * Cost comparison, previously 0% covered while being a public export that
 * decides which route a user is shown as cheapest.
 *
 * The two properties worth protecting are both about identity. `chains` is an
 * array and `options` an object, so depending on them by reference refetched
 * on every render for a caller writing them inline — an unbounded loop against
 * a cost API. And with no request-generation guard, a comparison for a chain
 * set the user has moved on from could resolve last and decide what they see.
 */

const comparison: CostComparison[] = [
  {
    chain: "eip155:1",
    chainName: "Ethereum",
    totalCost: "12.00",
    gasCost: "11.00",
    estimatedTimeMs: 60_000,
  },
];

describe("useCompareCosts — request identity", () => {
  it("does not refetch when the caller rebuilds an equal input", async () => {
    // The natural call site passes an inline array and object literal.
    const compare = vi.fn().mockResolvedValue(comparison);
    const { rerender } = renderHook(
      () =>
        useCompareCosts(
          {
            operation: "bridge",
            chains: ["eip155:1", "eip155:137"],
            options: { amount: "1" },
          },
          compare,
        ),
      { initialProps: {} },
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));

    rerender({});
    rerender({});
    await act(async () => {
      await Promise.resolve();
    });

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("refetches when the chain set actually changes", async () => {
    const compare = vi.fn().mockResolvedValue(comparison);
    const { rerender } = renderHook(
      (props: { chains: string[] }) =>
        useCompareCosts({ operation: "bridge", chains: props.chains }, compare),
      { initialProps: { chains: ["eip155:1"] } },
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));

    rerender({ chains: ["eip155:1", "eip155:137"] });
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(2));
  });

  it("treats reordered options as the same request", async () => {
    const compare = vi.fn().mockResolvedValue(comparison);
    const { rerender } = renderHook(
      (props: { options: Record<string, unknown> }) =>
        useCompareCosts(
          { operation: "bridge", chains: ["eip155:1"], options: props.options },
          compare,
        ),
      { initialProps: { options: { amount: "1", token: "USDC" } } },
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));

    rerender({ options: { token: "USDC", amount: "1" } });
    await act(async () => {
      await Promise.resolve();
    });
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("refetches when an option value changes", async () => {
    const compare = vi.fn().mockResolvedValue(comparison);
    const { rerender } = renderHook(
      (props: { amount: string }) =>
        useCompareCosts(
          {
            operation: "bridge",
            chains: ["eip155:1"],
            options: { amount: props.amount },
          },
          compare,
        ),
      { initialProps: { amount: "1" } },
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    rerender({ amount: "2" });
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(2));
  });

  it("survives a cyclic options object instead of throwing during render", async () => {
    // JSON.stringify would take the render down with it.
    const cyclic: Record<string, unknown> = { amount: "1" };
    cyclic.self = cyclic;
    const compare = vi.fn().mockResolvedValue(comparison);
    expect(() =>
      renderHook(() =>
        useCompareCosts(
          { operation: "bridge", chains: ["eip155:1"], options: cyclic },
          compare,
        ),
      ),
    ).not.toThrow();
  });
});

describe("useCompareCosts — results", () => {
  it("exposes the comparisons", async () => {
    const { result } = renderHook(() =>
      useCompareCosts(
        { operation: "bridge", chains: ["eip155:1"] },
        vi.fn().mockResolvedValue(comparison),
      ),
    );
    await waitFor(() => expect(result.current.comparisons).toEqual(comparison));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("reports an empty chain list without calling the comparer", async () => {
    const compare = vi.fn();
    const { result } = renderHook(() =>
      useCompareCosts({ operation: "bridge", chains: [] }, compare),
    );
    await waitFor(() => expect(result.current.comparisons).toEqual([]));
    expect(compare).not.toHaveBeenCalled();
  });

  it("clears results on failure rather than showing stale costs", async () => {
    const compare = vi
      .fn()
      .mockResolvedValueOnce(comparison)
      .mockRejectedValueOnce(new Error("provider down"));
    const { result, rerender } = renderHook(
      (props: { chains: string[] }) =>
        useCompareCosts({ operation: "bridge", chains: props.chains }, compare),
      { initialProps: { chains: ["eip155:1"] } },
    );
    await waitFor(() => expect(result.current.comparisons).toEqual(comparison));

    rerender({ chains: ["eip155:137"] });
    await waitFor(() =>
      expect(result.current.error?.message).toBe("provider down"),
    );
    expect(result.current.comparisons).toEqual([]);
  });

  it("ignores a comparison for a chain set the caller moved on from", async () => {
    // The dangerous case: costs for the previous chains arriving last and
    // being presented as the current answer.
    let releaseFirst!: (value: CostComparison[]) => void;
    const stale: CostComparison[] = [
      { ...comparison[0], chain: "eip155:1", totalCost: "999.00" },
    ];
    const fresh: CostComparison[] = [
      { ...comparison[0], chain: "eip155:137", totalCost: "0.10" },
    ];
    const compare = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<CostComparison[]>((resolve) => (releaseFirst = resolve)),
      )
      .mockResolvedValueOnce(fresh);

    const { result, rerender } = renderHook(
      (props: { chains: string[] }) =>
        useCompareCosts({ operation: "bridge", chains: props.chains }, compare),
      { initialProps: { chains: ["eip155:1"] } },
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));

    rerender({ chains: ["eip155:137"] });
    await waitFor(() => expect(result.current.comparisons).toEqual(fresh));

    await act(async () => {
      releaseFirst(stale);
      await Promise.resolve();
    });
    expect(result.current.comparisons).toEqual(fresh);
  });

  it("refresh re-runs the comparison", async () => {
    const compare = vi.fn().mockResolvedValue(comparison);
    const { result } = renderHook(() =>
      useCompareCosts({ operation: "bridge", chains: ["eip155:1"] }, compare),
    );
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.refresh();
    });
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a comparer", async () => {
    const { result } = renderHook(() =>
      useCompareCosts({ operation: "bridge", chains: ["eip155:1"] }, undefined),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.comparisons).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
