/// <reference types="vitest" />
/// @vitest-environment jsdom
import { InAppChannel } from "@naculus/connect-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNotification } from "./useNotification";

function memoryStorage() {
  const map = new Map<string, unknown>();
  return {
    saved: map,
    getItem: async <T,>(key: string) => (map.get(key) as T) ?? null,
    setItem: async <T,>(key: string, value: T) => {
      map.set(key, value);
    },
    removeItem: async (key: string) => {
      map.delete(key);
    },
  };
}

function setup() {
  const storage = memoryStorage();
  const hook = renderHook(() =>
    useNotification({ channel: new InAppChannel(), storage }),
  );
  return { storage, ...hook };
}

describe("useNotification muted chains", () => {
  it("keeps every chain muted in one tick", async () => {
    const { result } = setup();
    await act(async () => {});
    act(() => {
      result.current.muteChain("eip155:1");
      result.current.muteChain("eip155:8453");
      result.current.muteChain("eip155:10");
    });
    expect(result.current.settings.mutedChains).toEqual([
      "eip155:1",
      "eip155:8453",
      "eip155:10",
    ]);
  });

  it("applies interleaved mute and unmute in call order", async () => {
    const { result, storage } = setup();
    await act(async () => {});
    act(() => {
      result.current.muteChain("eip155:1");
      result.current.muteChain("eip155:8453");
      result.current.unmuteChain("eip155:1");
      result.current.muteChain("eip155:10");
    });
    expect(result.current.settings.mutedChains).toEqual([
      "eip155:8453",
      "eip155:10",
    ]);
    // What was persisted is the final state, not an intermediate one.
    const persisted = [...storage.saved.values()].at(-1) as {
      mutedChains: string[];
    };
    expect(persisted.mutedChains).toEqual(["eip155:8453", "eip155:10"]);
  });

  it("keeps a muted chain when another setting changes in the same tick", async () => {
    const { result } = setup();
    await act(async () => {});
    act(() => {
      result.current.muteChain("eip155:1");
      result.current.updateSettings({ telegram: true });
    });
    expect(result.current.settings.mutedChains).toEqual(["eip155:1"]);
    expect(result.current.settings.telegram).toBe(true);
  });
});

describe("useNotification persisted-settings load", () => {
  it("keeps changes made before the persisted settings finish loading", async () => {
    let resolveLoad!: (value: unknown) => void;
    const saved = new Map<string, unknown>();
    const storage = {
      getItem: <T,>() =>
        new Promise<T | null>((resolve) => {
          resolveLoad = resolve as (value: unknown) => void;
        }),
      setItem: async <T,>(key: string, value: T) => {
        saved.set(key, value);
      },
      removeItem: async () => {},
    };
    const { result } = renderHook(() =>
      useNotification({ channel: new InAppChannel(), storage }),
    );
    act(() => result.current.muteChain("eip155:1"));
    await act(async () => {
      resolveLoad({
        telegram: true,
        webpush: false,
        inapp: true,
        frequency: "all",
        mutedChains: ["eip155:5"],
        mutedTypes: [],
      });
    });
    expect(result.current.settings.mutedChains).toEqual([
      "eip155:5",
      "eip155:1",
    ]);
    expect(result.current.settings.telegram).toBe(true);
    const persisted = [...saved.values()].at(-1) as { mutedChains: string[] };
    expect(persisted.mutedChains).toEqual(["eip155:5", "eip155:1"]);
  });
});
