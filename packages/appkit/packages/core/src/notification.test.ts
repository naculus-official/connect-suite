import { describe, expect, it, vi } from "vitest";
import type { NotificationSettings } from "@naculus/connect-core";
import {
  channelsUpdate,
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  mutedChainSettings,
  NOTIFICATION_SETTINGS_KEY,
  replayNotificationSettings,
  saveNotificationSettings,
  type NotificationSettingsStorage,
  updateNotificationSettings,
} from "./notification";

describe("notification settings", () => {
  it("loads and saves through the same persisted key", async () => {
    const saved: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      telegram: true,
    };
    const getItem = vi.fn();
    const setItem = vi.fn();
    const storage: NotificationSettingsStorage = {
      getItem: async <T>(key: string) => {
        getItem(key);
        return saved as T;
      },
      setItem: async <T>(key: string, value: T) => {
        setItem(key, value);
      },
      removeItem: async () => {},
    };
    expect(await loadNotificationSettings(storage)).toEqual(saved);
    saveNotificationSettings(storage, saved);
    expect(getItem).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_KEY);
    expect(setItem).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_KEY, saved);
  });

  it("keeps the existing channel and mute update rules", () => {
    const channels = channelsUpdate(["telegram"]);
    expect(channels).toEqual({ telegram: true });
    const settings = updateNotificationSettings(
      DEFAULT_NOTIFICATION_SETTINGS,
      channels,
    );
    expect(settings.inapp).toBe(true);
    expect(mutedChainSettings(settings, "eip155:1", true)).toEqual({
      mutedChains: ["eip155:1"],
    });
    expect(
      mutedChainSettings(
        { ...settings, mutedChains: ["eip155:1", "eip155:137"] },
        "eip155:1",
        false,
      ),
    ).toEqual({ mutedChains: ["eip155:137"] });
  });
});

describe("replayNotificationSettings", () => {
  const persisted: NotificationSettings = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    telegram: true,
    mutedChains: ["eip155:5"],
  };

  it("replays changes in order on top of the persisted settings", () => {
    const next = replayNotificationSettings(persisted, [
      (s) => mutedChainSettings(s, "eip155:1", true),
      (s) => mutedChainSettings(s, "eip155:5", false),
      () => ({ inapp: false }),
    ]);
    expect(next.mutedChains).toEqual(["eip155:1"]);
    expect(next.telegram).toBe(true);
    expect(next.inapp).toBe(false);
  });

  it("starts from the defaults when nothing was persisted", () => {
    expect(
      replayNotificationSettings(null, [
        (s) => mutedChainSettings(s, "eip155:1", true),
      ]),
    ).toEqual({ ...DEFAULT_NOTIFICATION_SETTINGS, mutedChains: ["eip155:1"] });
  });

  it("returns the persisted settings unchanged without updates", () => {
    expect(replayNotificationSettings(persisted, [])).toBe(persisted);
  });
});
