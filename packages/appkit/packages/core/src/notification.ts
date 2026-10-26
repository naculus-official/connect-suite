/** Framework-neutral in-app notification actions and settings persistence. */

import {
  createStorageAdapter,
  type InAppChannel,
  type NotificationFrequency,
  type NotificationItem,
  type NotificationSettings,
} from "@naculus/connect-core";

export interface NotificationSettingsStorage {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const NOTIFICATION_SETTINGS_KEY = "naculus_notif_react_settings";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  telegram: false,
  webpush: false,
  inapp: true,
  frequency: "final-only" as NotificationFrequency,
  mutedChains: [],
  mutedTypes: [],
};

/** Preserve the existing localStorage adapter and fail-open UI fallback. */
export function createNotificationSettingsStorage(): NotificationSettingsStorage {
  const storage = createStorageAdapter("local", "naculus_notif_");
  return {
    getItem: async <T>(key: string): Promise<T | null> => {
      try {
        return await storage.get<T>(key);
      } catch (cause) {
        console.warn(
          "notification settings: failed to read from storage:",
          cause,
        );
        return null;
      }
    },
    setItem: async <T>(key: string, value: T): Promise<void> => {
      try {
        await storage.set(key, value);
      } catch (cause) {
        console.warn(
          "notification settings: failed to write to storage:",
          cause,
        );
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        await storage.remove(key);
      } catch (cause) {
        console.warn(
          "notification settings: failed to remove from storage:",
          cause,
        );
      }
    },
  };
}

export async function loadNotificationSettings(
  storage: NotificationSettingsStorage,
): Promise<NotificationSettings | null> {
  return storage.getItem<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
}

export function saveNotificationSettings(
  storage: NotificationSettingsStorage,
  settings: NotificationSettings,
): void {
  storage.setItem(NOTIFICATION_SETTINGS_KEY, settings).catch(() => {});
}

export function updateNotificationSettings(
  current: NotificationSettings,
  update: Partial<NotificationSettings>,
): NotificationSettings {
  return { ...current, ...update };
}

/** One settings change, computed from the settings it applies to. */
export type NotificationSettingsUpdate = (
  current: NotificationSettings,
) => Partial<NotificationSettings>;

/**
 * The settings once the persisted ones finish loading: every change made
 * before the load resolved, replayed in order on top of what was persisted
 * (or the defaults when nothing was). Without this the late load overwrote
 * those changes, e.g. a chain muted during the first render came back.
 */
export function replayNotificationSettings(
  persisted: NotificationSettings | null,
  updates: readonly NotificationSettingsUpdate[],
): NotificationSettings {
  let settings = persisted ?? DEFAULT_NOTIFICATION_SETTINGS;
  for (const update of updates) {
    settings = updateNotificationSettings(settings, update(settings));
  }
  return settings;
}

export function channelsUpdate(
  channels: string[],
): Partial<NotificationSettings> {
  const update: Partial<NotificationSettings> = {};
  if (channels.includes("telegram")) update.telegram = true;
  if (channels.includes("webpush")) update.webpush = true;
  if (channels.includes("inapp")) update.inapp = true;
  return update;
}

export function mutedChainSettings(
  settings: NotificationSettings,
  chainId: string,
  muted: boolean,
): Partial<NotificationSettings> {
  return {
    mutedChains: muted
      ? [...new Set([...settings.mutedChains, chainId])]
      : settings.mutedChains.filter((id) => id !== chainId),
  };
}

export function createNotification(
  item: Omit<NotificationItem, "id" | "timestamp">,
): NotificationItem {
  return {
    ...item,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
}

function sendItem(
  channel: InAppChannel,
  item: NotificationItem,
): Promise<void> {
  return channel.send({
    id: item.id,
    userId: "",
    txHash: item.txHash,
    chainId: "",
    chainName: item.chainName,
    status: item.status,
    title: item.title,
    body: item.body,
    valueFormatted: item.valueFormatted,
    explorerUrl: item.explorerUrl,
    timestamp: item.timestamp,
  });
}

export function addInAppNotification(
  channel: InAppChannel,
  item: Omit<NotificationItem, "id" | "timestamp">,
): void {
  void sendItem(channel, createNotification(item));
}

/** InAppChannel has no remove-one method; preserve its clear/replay behavior. */
export async function clearOneInAppNotification(
  channel: InAppChannel,
  id: string,
): Promise<NotificationItem[]> {
  const remaining = channel.getHistory().filter((item) => item.id !== id);
  channel.clear();
  await Promise.all(remaining.map((item) => sendItem(channel, item)));
  return channel.getHistory();
}
