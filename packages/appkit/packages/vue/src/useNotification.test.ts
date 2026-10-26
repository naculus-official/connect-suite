import type {
  InAppChannel,
  NotificationItem,
  NotificationSettings,
} from "@naculus/connect-core";
import type { NotificationSettingsStorage } from "@naculus/connect-appkit-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useNotification } from "./useNotification";

function makeChannel() {
  let history: NotificationItem[] = [];
  const channel = {
    onNotification: undefined as ((item: NotificationItem) => void) | undefined,
    getHistory: () => [...history],
    restore: vi.fn(async () => {}),
    clear: vi.fn(() => {
      history = [];
    }),
    send: vi.fn(async (raw: Record<string, unknown>) => {
      const item = { ...raw, read: false } as unknown as NotificationItem;
      history.push(item);
      channel.onNotification?.(item);
    }),
    markAsRead: vi.fn((id: string) => {
      history = history.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      );
    }),
    markAllAsRead: vi.fn(() => {
      history = history.map((item) => ({ ...item, read: true }));
    }),
  };
  return channel;
}

describe("useNotification", () => {
  it("tracks channel events, read state, clear-one and cleanup", async () => {
    const channel = makeChannel();
    const storage: NotificationSettingsStorage = {
      getItem: async <T>() => null as T | null,
      setItem: async () => {},
      removeItem: async () => {},
    };
    const scope = effectScope();
    const state = scope.run(() =>
      useNotification({
        channel: channel as unknown as InAppChannel,
        storage,
      }),
    );
    if (!state) throw new Error("Missing notification state");

    state.addNotification({
      title: "One",
      body: "Test",
      status: "confirmed",
    } as Omit<NotificationItem, "id" | "timestamp">);
    await nextTick();
    expect(state.notifications.value).toHaveLength(1);
    expect(state.unreadCount.value).toBe(1);
    const firstId = state.notifications.value[0].id;
    state.markAsRead(firstId);
    expect(state.unreadCount.value).toBe(0);

    state.addNotification({
      title: "Two",
      body: "Test",
      status: "confirmed",
    } as Omit<NotificationItem, "id" | "timestamp">);
    await nextTick();
    state.clearOne(firstId);
    await vi.waitFor(() => expect(state.notifications.value).toHaveLength(1));

    scope.stop();
    expect(channel.onNotification).toBeUndefined();
  });

  it("keeps every chain across rapid consecutive and interleaved mute/unmute calls", async () => {
    const storage = {
      getItem: async <T>() => null as T | null,
      setItem: async () => {},
      removeItem: async () => {},
    };
    const scope = effectScope();
    const state = scope.run(() =>
      useNotification({
        channel: makeChannel() as unknown as InAppChannel,
        storage,
      }),
    );
    if (!state) throw new Error("Missing notification state");
    state.muteChain("eip155:1");
    state.muteChain("eip155:8453");
    state.unmuteChain("eip155:1");
    state.muteChain("eip155:10");
    expect(state.settings.value.mutedChains).toEqual([
      "eip155:8453",
      "eip155:10",
    ]);
    scope.stop();
  });

  it("keeps changes made before the persisted settings finish loading", async () => {
    let resolveLoad!: (value: unknown) => void;
    const setItem = vi.fn();
    const storage = {
      getItem: <T>() =>
        new Promise<T | null>((resolve) => {
          resolveLoad = resolve as (value: unknown) => void;
        }),
      setItem: async <T>(key: string, value: T) => {
        setItem(key, value);
      },
      removeItem: async () => {},
    };
    const scope = effectScope();
    const state = scope.run(() =>
      useNotification({
        channel: makeChannel() as unknown as InAppChannel,
        storage,
      }),
    );
    if (!state) throw new Error("Missing notification state");
    state.muteChain("eip155:1");
    resolveLoad({
      telegram: true,
      webpush: false,
      inapp: true,
      frequency: "all",
      mutedChains: ["eip155:5"],
      mutedTypes: [],
    });
    await vi.waitFor(() =>
      expect(state.settings.value.mutedChains).toEqual([
        "eip155:5",
        "eip155:1",
      ]),
    );
    expect(state.settings.value.telegram).toBe(true);
    expect(setItem).toHaveBeenLastCalledWith(
      "naculus_notif_react_settings",
      expect.objectContaining({ mutedChains: ["eip155:5", "eip155:1"] }),
    );
    scope.stop();
  });

  it("loads and persists settings without changing the React storage key", async () => {
    const saved = {
      telegram: true,
      webpush: false,
      inapp: true,
      frequency: "final-only",
      mutedChains: [],
      mutedTypes: [],
    } as NotificationSettings;
    const setItem = vi.fn();
    const storage = {
      getItem: async <T>() => saved as T,
      setItem: async <T>(key: string, value: T) => {
        setItem(key, value);
      },
      removeItem: async () => {},
    };
    const scope = effectScope();
    const state = scope.run(() =>
      useNotification({
        channel: makeChannel() as unknown as InAppChannel,
        storage,
      }),
    );
    if (!state) throw new Error("Missing notification state");
    await vi.waitFor(() => expect(state.settings.value.telegram).toBe(true));
    state.muteChain("eip155:1");
    expect(setItem).toHaveBeenCalledWith(
      "naculus_notif_react_settings",
      expect.objectContaining({ mutedChains: ["eip155:1"] }),
    );
    scope.stop();
  });
});
