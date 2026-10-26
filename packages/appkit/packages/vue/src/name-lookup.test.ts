import type { NameResolver } from "@naculus/connect-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";

const { getResolver } = vi.hoisted(() => ({ getResolver: vi.fn() }));
vi.mock("@naculus/connect-appkit-core", () => ({ getResolver }));

import { useLookupAddress } from "./useLookupAddress";
import { useResolveName } from "./useResolveName";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("Vue name lookups", () => {
  beforeEach(() => {
    getResolver.mockReset();
  });

  it("discards stale forward results after input changes or clears", async () => {
    let finishFirst!: (value: unknown) => void;
    const resolver = {
      resolveName: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishFirst = resolve;
            }),
        )
        .mockResolvedValueOnce({ address: "new" }),
    };
    getResolver.mockReturnValue(resolver);
    const name = ref("old.eth");
    const scope = effectScope();
    const result = scope.run(() => useResolveName(name));
    if (!result) throw new Error("No composable result");
    await flush();
    name.value = "new.eth";
    // A synchronous consumer must not observe the old address under a new name.
    expect(result.data.value).toBeNull();
    await nextTick();
    await flush();
    expect(result.data.value?.address).toBe("new");
    finishFirst({ address: "old" });
    await flush();
    expect(result.data.value?.address).toBe("new");
    name.value = " ";
    await nextTick();
    expect(result.data.value).toBeNull();
    expect(resolver.resolveName).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("rebuilds resolver on config change and ignores disposed results", async () => {
    let finish!: (value: unknown) => void;
    const first = {
      resolveName: vi.fn().mockResolvedValue({ address: "first" }),
    };
    const second = {
      resolveName: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    };
    getResolver.mockImplementation((config) => (config ? second : first));
    const config = ref<unknown>(undefined);
    const scope = effectScope();
    const result = scope.run(() =>
      useResolveName("name.eth", { resolverConfig: config as never }),
    );
    if (!result) throw new Error("No composable result");
    await vi.waitFor(() => expect(result.data.value?.address).toBe("first"));
    config.value = { ethRpcUrl: "https://example.invalid" };
    await nextTick();
    await flush();
    expect(second.resolveName).toHaveBeenCalledTimes(1);
    scope.stop();
    finish({ address: "late" });
    await flush();
    expect(result.data.value).toBeNull();
  });

  it("passes the reactive CAIP-2 scope to reverse lookup", async () => {
    const resolver = { lookupAddress: vi.fn().mockResolvedValue(null) };
    getResolver.mockReturnValue(resolver as unknown as NameResolver);
    const chainId = ref("eip155:1");
    const scope = effectScope();
    const result = scope.run(() => useLookupAddress("0x123", { chainId }));
    if (!result) throw new Error("No composable result");
    await flush();
    expect(resolver.lookupAddress).toHaveBeenCalledWith("0x123", "eip155:1");
    expect(result.error.value).toBeNull();
    chainId.value = "eip155:137";
    await nextTick();
    await flush();
    expect(resolver.lookupAddress).toHaveBeenCalledWith("0x123", "eip155:137");
    scope.stop();
  });

  it("clears a resolved address synchronously on input and skip changes", async () => {
    const resolver = {
      resolveName: vi.fn().mockResolvedValue({ address: "resolved" }),
    };
    getResolver.mockReturnValue(resolver);
    const name = ref("first.eth");
    const skip = ref(false);
    const scope = effectScope();
    const result = scope.run(() => useResolveName(name, { skip }));
    if (!result) throw new Error("No composable result");
    await vi.waitFor(() => expect(result.data.value?.address).toBe("resolved"));
    name.value = "second.eth";
    expect(result.data.value).toBeNull();
    await vi.waitFor(() => expect(result.data.value?.address).toBe("resolved"));
    skip.value = true;
    expect(result.data.value).toBeNull();
    scope.stop();
  });

  it("invalidates in-flight results when a nested resolver setting changes", async () => {
    let finishFirst!: (value: unknown) => void;
    const first = {
      resolveName: vi.fn(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      ),
    };
    const second = {
      resolveName: vi.fn().mockResolvedValue({ address: "new-provider" }),
    };
    getResolver.mockImplementation((config) =>
      config?.providers?.ens?.rpcUrl === "https://new.invalid" ? second : first,
    );
    const config = ref({
      providers: { ens: { rpcUrl: "https://old.invalid" } },
    });
    const scope = effectScope();
    const result = scope.run(() =>
      useResolveName("name.eth", { resolverConfig: config }),
    );
    if (!result) throw new Error("No composable result");
    await flush();
    config.value.providers.ens.rpcUrl = "https://new.invalid";
    expect(result.data.value).toBeNull();
    await vi.waitFor(() =>
      expect(result.data.value?.address).toBe("new-provider"),
    );
    finishFirst({ address: "old-provider" });
    await flush();
    expect(result.data.value?.address).toBe("new-provider");
    scope.stop();
  });
});
