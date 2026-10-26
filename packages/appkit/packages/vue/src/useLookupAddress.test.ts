import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

const { getResolver } = vi.hoisted(() => ({ getResolver: vi.fn() }));
vi.mock("@naculus/connect-appkit-core", () => ({ getResolver }));

import { useLookupAddress } from "./useLookupAddress";

describe("useLookupAddress (Vue) stale results", () => {
  it("keeps the newest lookup when an older one resolves last", async () => {
    const answers: Array<(value: unknown) => void> = [];
    const resolver = {
      lookupAddress: vi.fn(
        () =>
          new Promise((resolve) => {
            answers.push(resolve);
          }),
      ),
    };
    getResolver.mockReturnValue(resolver);
    const scope = effectScope();
    const result = scope.run(() =>
      useLookupAddress("0x1111111111111111111111111111111111111111"),
    )!;

    result.refetch(); // request A
    result.refetch(); // request B
    await vi.waitFor(() => expect(answers).toHaveLength(3));
    answers[2]!({ name: "b.eth" });
    await vi.waitFor(() =>
      expect(result.data.value).toEqual({ name: "b.eth" }),
    );
    answers[1]!({ name: "a.eth" });
    answers[0]!({ name: "initial.eth" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.data.value).toEqual({ name: "b.eth" });
    expect(result.isLoading.value).toBe(false);
    scope.stop();
  });
});
