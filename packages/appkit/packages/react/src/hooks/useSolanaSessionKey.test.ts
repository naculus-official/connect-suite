/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  testSolanaDeps,
  testSolanaScope,
} from "../../../../test-utils/solana-session-fixtures";
import { useSolanaSessionKey } from "./useSolanaSessionKey";

describe("useSolanaSessionKey (React)", () => {
  it("creates an approved key and lists it", async () => {
    const deps = testSolanaDeps();
    const { result } = renderHook(() => useSolanaSessionKey(deps));
    let id = "";
    await act(async () => {
      id = (await result.current.create(testSolanaScope())).key.id;
    });
    await waitFor(() =>
      expect(result.current.keys.map((k) => k.id)).toEqual([id]),
    );
    expect(result.current.keys[0]?.status).toBe("active");
    expect(result.current.isPending).toBe(false);
  });

  it("publishes a declined approval and shows the key revoked", async () => {
    const deps = testSolanaDeps({ decline: true });
    const { result } = renderHook(() => useSolanaSessionKey(deps));
    await act(async () => {
      await expect(result.current.create(testSolanaScope())).rejects.toThrow(
        "user_rejected",
      );
    });
    expect(result.current.error?.message).toBe("user_rejected");
    await waitFor(() => expect(result.current.keys[0]?.status).toBe("revoked"));
  });

  it("revokes, and has nothing to act on without dependencies", async () => {
    const deps = testSolanaDeps();
    const { result, rerender } = renderHook(({ d }) => useSolanaSessionKey(d), {
      initialProps: { d: deps as ReturnType<typeof testSolanaDeps> | null },
    });
    let id = "";
    await act(async () => {
      id = (await result.current.create(testSolanaScope())).key.id;
      await result.current.revoke(id);
    });
    await waitFor(() => expect(result.current.keys[0]?.status).toBe("revoked"));
    rerender({ d: null });
    await waitFor(() => expect(result.current.keys).toEqual([]));
    await expect(result.current.create(testSolanaScope())).rejects.toThrow(
      /No Solana session key manager/,
    );
  });
});
