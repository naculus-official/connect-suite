import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useSolanaBalance } from "./useSolanaBalance";

const ADDRESS = "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW";

function rpc(...responses: unknown[]) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => responses.shift() ?? { result: { value: null } },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("useSolanaBalance (Vue)", () => {
  it("reads a balance through the shared core", async () => {
    rpc({ result: { value: 2_500_000_000 } }, { result: { value: {} } });
    const { api } = inScope(() =>
      useSolanaBalance(ADDRESS, "https://rpc.test"),
    );
    await vi.waitFor(() => expect(api.balance.value).not.toBeNull());
    // Exactly what the React hook produces for the same response — the
    // formatting is the shared core's, not this file's.
    expect(api.balance.value?.sol).toBe("2.5");
  });

  it("re-reads when the address ref changes", async () => {
    const fetchMock = rpc(
      { result: { value: 1_000_000_000 } },
      { result: { value: {} } },
      { result: { value: 3_000_000_000 } },
      { result: { value: {} } },
    );
    const address = ref<string | null>(ADDRESS);
    const { api } = inScope(() =>
      useSolanaBalance(address, "https://rpc.test"),
    );
    await vi.waitFor(() => expect(api.balance.value?.sol).toBe("1"));

    address.value = "OtherAddress";
    await nextTick();
    await vi.waitFor(() => expect(api.balance.value?.sol).toBe("3"));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does nothing without an address or an endpoint", async () => {
    const fetchMock = rpc();
    inScope(() => useSolanaBalance(null, "https://rpc.test"));
    inScope(() => useSolanaBalance(ADDRESS, null));
    await nextTick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the balance on failure rather than leaving it stale", async () => {
    rpc({ result: { value: 5_000_000_000 } }, { result: { value: {} } });
    const { api } = inScope(() =>
      useSolanaBalance(ADDRESS, "https://rpc.test"),
    );
    await vi.waitFor(() => expect(api.balance.value?.sol).toBe("5"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    await api.refetch();
    expect(api.error.value).not.toBeNull();
    expect(api.balance.value).toBeNull();
  });

  // A response arriving after the component is gone must not write into it.
  it("stops writing after the scope is disposed", async () => {
    let release!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((r) => {
            release = r;
          }),
      ),
    );
    const { api, scope } = inScope(() =>
      useSolanaBalance(ADDRESS, "https://rpc.test"),
    );
    scope.stop();
    release({ ok: true, json: async () => ({ result: { value: 1 } }) });
    await nextTick();
    expect(api.balance.value).toBeNull();
  });

  it("keeps the newest address when an older read resolves last", async () => {
    const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    const release = new Map<string, () => void>();
    const gates = new Map<string, Promise<void>>();
    for (const key of [ADDRESS, OTHER]) {
      gates.set(
        key,
        new Promise<void>((resolve) => {
          release.set(key, resolve);
        }),
      );
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const key = init.body.includes(OTHER) ? OTHER : ADDRESS;
        await gates.get(key);
        const { method } = JSON.parse(init.body) as { method: string };
        const lamports = key === OTHER ? 2_000_000_000 : 1_000_000_000;
        return {
          ok: true,
          json: async () =>
            method === "getBalance"
              ? { result: { value: lamports } }
              : { result: { value: {} } },
        };
      }),
    );
    const address = ref<string>(ADDRESS);
    const { api, scope } = inScope(() =>
      useSolanaBalance(address, "https://rpc.test"),
    );

    // Request A is the initial read; request B starts on the address change.
    address.value = OTHER;
    await nextTick();
    release.get(OTHER)!();
    await vi.waitFor(() => expect(api.balance.value?.sol).toBe("2"));
    release.get(ADDRESS)!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.balance.value?.sol).toBe("2");
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing after disposal", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        await gate;
        const { method } = JSON.parse(init.body) as { method: string };
        return {
          ok: true,
          json: async () =>
            method === "getBalance"
              ? { result: { value: 1_000_000_000 } }
              : { result: { value: {} } },
        };
      }),
    );
    const { api, scope } = inScope(() =>
      useSolanaBalance(ADDRESS, "https://rpc.test"),
    );
    scope.stop();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.balance.value).toBeNull();
    expect(api.isFetching.value).toBe(true);
  });
});

describe("useSolanaBalance (Vue) once the address or endpoint is removed", () => {
  const OTHER_RPC = "https://other-rpc.test";

  /**
   * Stubs fetch so every read waits on its endpoint's gate, then answers
   * with `lamports` or fails with HTTP 500 (`lamports === null`).
   */
  function gatedRpc(answers: Record<string, number | null>) {
    const release = new Map<string, () => void>();
    const gates = new Map<string, Promise<void>>();
    for (const url of Object.keys(answers)) {
      gates.set(
        url,
        new Promise<void>((resolve) => {
          release.set(url, resolve);
        }),
      );
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        await gates.get(url);
        const lamports = answers[url];
        if (lamports === null) return { ok: false, status: 500 };
        const { method } = JSON.parse(init.body) as { method: string };
        return {
          ok: true,
          json: async () =>
            method === "getBalance"
              ? { result: { value: lamports } }
              : { result: { value: {} } },
        };
      }),
    );
    return (url: string) => release.get(url)!();
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("drops a late balance once the address is removed", async () => {
    const release = gatedRpc({ "https://rpc.test": 1_000_000_000 });
    const address = ref<string | null>(ADDRESS);
    const { api, scope } = inScope(() =>
      useSolanaBalance(address, "https://rpc.test"),
    );
    expect(api.isFetching.value).toBe(true);

    address.value = null;
    await nextTick();
    expect(api.isFetching.value).toBe(false);
    expect(api.balance.value).toBeNull();

    release("https://rpc.test");
    await flush();
    expect(api.balance.value).toBeNull();
    expect(api.error.value).toBeNull();
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("drops a late failure once the endpoint is removed", async () => {
    const release = gatedRpc({ "https://rpc.test": null });
    const rpcUrl = ref<string | null>("https://rpc.test");
    const { api, scope } = inScope(() => useSolanaBalance(ADDRESS, rpcUrl));
    expect(api.isFetching.value).toBe(true);

    rpcUrl.value = null;
    await nextTick();
    expect(api.isFetching.value).toBe(false);

    release("https://rpc.test");
    await flush();
    expect(api.balance.value).toBeNull();
    expect(api.error.value).toBeNull();
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("keeps the visible error and clears the balance once the address is removed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );
    const address = ref<string | null>(ADDRESS);
    const { api, scope } = inScope(() =>
      useSolanaBalance(address, "https://rpc.test"),
    );
    await vi.waitFor(() => expect(api.error.value).not.toBeNull());
    const visible = api.error.value;

    address.value = null;
    await nextTick();
    expect(api.error.value).toBe(visible);
    expect(api.balance.value).toBeNull();
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("keeps B when the old endpoint's failure arrives after B", async () => {
    const release = gatedRpc({
      "https://rpc.test": null,
      [OTHER_RPC]: 2_000_000_000,
    });
    const rpcUrl = ref<string>("https://rpc.test");
    const { api, scope } = inScope(() => useSolanaBalance(ADDRESS, rpcUrl));

    rpcUrl.value = OTHER_RPC;
    await nextTick();
    release(OTHER_RPC);
    await vi.waitFor(() => expect(api.balance.value?.sol).toBe("2"));
    release("https://rpc.test");
    await flush();
    expect(api.balance.value?.sol).toBe("2");
    expect(api.error.value).toBeNull();
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });
});

describe("useSolanaBalance (Vue) clearing a published balance", () => {
  it.each(["address", "endpoint"] as const)(
    "clears the balance once the %s is removed",
    async (removed) => {
      rpc({ result: { value: 4_000_000_000 } }, { result: { value: {} } });
      const address = ref<string | null>(ADDRESS);
      const rpcUrl = ref<string | null>("https://rpc.test");
      const { api, scope } = inScope(() => useSolanaBalance(address, rpcUrl));
      await vi.waitFor(() => expect(api.balance.value?.sol).toBe("4"));

      if (removed === "address") address.value = null;
      else rpcUrl.value = null;
      await nextTick();
      expect(api.balance.value).toBeNull();
      expect(api.error.value).toBeNull();
      expect(api.isFetching.value).toBe(false);
      scope.stop();
    },
  );
});
