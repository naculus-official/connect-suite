/// <reference types="vitest" />
/// @vitest-environment jsdom

import type { ListedAuthorization } from "@naculus/connect-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  enforcer: "evm-session",
} as ListedAuthorization;

describe("useAuthorizations", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([entry]);
    mocks.revoke.mockReset().mockResolvedValue({
      onChainRevocationRequired: true,
    });
  });

  it("lists, revokes, returns the on-chain signal, and refreshes", async () => {
    const managers = {};
    const { result } = renderHook(() => useAuthorizations({ managers }));
    await waitFor(() => expect(result.current.entries).toEqual([entry]));
    let revoked: { onChainRevocationRequired: boolean } | undefined;
    await act(async () => {
      revoked = await result.current.revoke(entry);
    });
    expect(revoked).toEqual({ onChainRevocationRequired: true });
    expect(mocks.revoke).toHaveBeenCalledWith(managers, entry);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("ignores a late refresh result and updates from the newest one", async () => {
    let finishFirst!: (entries: ListedAuthorization[]) => void;
    mocks.list
      .mockImplementationOnce(
        () =>
          new Promise<ListedAuthorization[]>(
            (resolve) => (finishFirst = resolve),
          ),
      )
      .mockResolvedValueOnce([entry]);
    const managers = {};
    const { result } = renderHook(() => useAuthorizations({ managers }));
    await act(async () => result.current.refresh());
    expect(result.current.entries).toEqual([entry]);
    await act(async () => finishFirst([]));
    expect(result.current.entries).toEqual([entry]);
  });
});
