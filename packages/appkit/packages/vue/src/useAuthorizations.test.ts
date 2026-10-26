import type { ListedAuthorization } from "@naculus/connect-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useAuthorizations } from "./useAuthorizations";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@naculus/connect-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@naculus/connect-core")>()),
  listAuthorizations: mocks.list,
  revokeListedAuthorization: mocks.revoke,
}));

const entry = {
  keyId: "key-1",
  enforcer: "solana-session",
} as ListedAuthorization;

function mount<T>(fn: () => T) {
  const scope = effectScope();
  return { hook: scope.run(fn) as T, scope };
}

describe("useAuthorizations", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([entry]);
    mocks.revoke.mockReset().mockResolvedValue({
      onChainRevocationRequired: true,
    });
  });

  it("lists, revokes, returns the on-chain signal, and refreshes", async () => {
    const managers = {};
    const { hook, scope } = mount(() => useAuthorizations({ managers }));
    await nextTick();
    await vi.waitFor(() => expect(hook.entries.value).toEqual([entry]));
    await expect(hook.revoke(entry)).resolves.toEqual({
      onChainRevocationRequired: true,
    });
    expect(mocks.revoke).toHaveBeenCalledWith(managers, entry);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("ignores late list results after a newer refresh and disposal", async () => {
    const resolvers: Array<(entries: ListedAuthorization[]) => void> = [];
    mocks.list.mockImplementation(
      () =>
        new Promise<ListedAuthorization[]>((resolve) =>
          resolvers.push(resolve),
        ),
    );
    const { hook, scope } = mount(() => useAuthorizations({ managers: {} }));
    await nextTick();
    const newest = hook.refresh();
    resolvers[1]([entry]);
    await newest;
    resolvers[0]([]);
    await nextTick();
    expect(hook.entries.value).toEqual([entry]);
    const late = hook.refresh();
    scope.stop();
    resolvers[2]([]);
    await late;
    expect(hook.entries.value).toEqual([entry]);
  });
});
