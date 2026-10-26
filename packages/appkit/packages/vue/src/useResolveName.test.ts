import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, watch } from "vue";

const { getResolver } = vi.hoisted(() => ({ getResolver: vi.fn() }));
vi.mock("@naculus/connect-appkit-core", () => ({ getResolver }));

import { useResolveName } from "./useResolveName";

describe("useResolveName (Vue) stale results", () => {
  it("keeps the newest lookup when an older one resolves last", async () => {
    const answers: Array<(value: unknown) => void> = [];
    const resolver = {
      resolveName: vi.fn(
        () =>
          new Promise((resolve) => {
            answers.push(resolve);
          }),
      ),
    };
    getResolver.mockReturnValue(resolver);
    const scope = effectScope();
    const result = scope.run(() => useResolveName("vitalik.eth"))!;

    result.refetch(); // request A
    result.refetch(); // request B
    await vi.waitFor(() => expect(answers).toHaveLength(3));
    answers[2]!({ address: "B" });
    await vi.waitFor(() => expect(result.data.value).toEqual({ address: "B" }));
    answers[1]!({ address: "A" });
    answers[0]!({ address: "initial" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.data.value).toEqual({ address: "B" });
    expect(result.isLoading.value).toBe(false);
    scope.stop();
  });

  it("clears isLoading only once a failure's error is visible", async () => {
    getResolver.mockReturnValue({
      resolveName: vi.fn(() => Promise.reject(new Error("no resolver"))),
    });
    const seen: string[] = [];
    const scope = effectScope();
    const result = scope.run(() => {
      const state = useResolveName("vitalik.eth");
      const record = (flush: string) => (busy: boolean) => {
        if (!busy) seen.push(`${flush}:${state.error.value?.message ?? null}`);
      };
      watch(state.isLoading, record("sync"), { flush: "sync" });
      watch(state.isLoading, record("pre"));
      return state;
    })!;
    await vi.waitFor(() => expect(result.isLoading.value).toBe(false));
    await nextTick();
    expect(seen).toEqual(["sync:no resolver", "pre:no resolver"]);
    scope.stop();
  });
});
