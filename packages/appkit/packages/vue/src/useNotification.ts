import {
  addInAppNotification,
  channelsUpdate,
  clearOneInAppNotification,
  createNotificationSettingsStorage,
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  mutedChainSettings,
  saveNotificationSettings,
  replayNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingsStorage,
  type NotificationSettingsUpdate,
} from "@naculus/connect-appkit-core";
import {
  InAppChannel,
  type NotificationItem,
  type NotificationSettings,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, ShallowRef } from "vue";
import { computed, onScopeDispose, shallowRef, unref } from "vue";

export interface UseNotificationOptions {
  channel?: MaybeRef<InAppChannel>;
  storage?: MaybeRef<NotificationSettingsStorage>;
}

export interface UseNotificationReturn {
  notifications: ShallowRef<NotificationItem[]>;
  unreadCount: ComputedRef<number>;
  settings: ShallowRef<NotificationSettings>;
  addNotification: (item: Omit<NotificationItem, "id" | "timestamp">) => void;
  clear: () => void;
  clearOne: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  updateSettings: (update: Partial<NotificationSettings>) => void;
  setChannels: (channels: string[]) => void;
  muteChain: (chainId: string) => void;
  unmuteChain: (chainId: string) => void;
}

/** Vue state shell over the shared in-app notification actions. */
export function useNotification(
  options: UseNotificationOptions = {},
): UseNotificationReturn {
  const channel = unref(options.channel) ?? new InAppChannel();
  const storage = unref(options.storage) ?? createNotificationSettingsStorage();
  const notifications = shallowRef<NotificationItem[]>(channel.getHistory());
  const settings = shallowRef<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const unreadCount = computed(
    () => notifications.value.filter((item) => !item.read).length,
  );
  let disposed = false;

  // Changes made before the persisted settings load are queued and replayed
  // on top of them (replayNotificationSettings); null once loaded.
  let pending: NotificationSettingsUpdate[] | null = [];
  const settle = (saved: NotificationSettings | null): void => {
    const queued = pending ?? [];
    pending = null;
    if (disposed) return;
    if (queued.length === 0) {
      if (saved) settings.value = saved;
      return;
    }
    settings.value = replayNotificationSettings(saved, queued);
    saveNotificationSettings(storage, settings.value);
  };
  void loadNotificationSettings(storage).then(settle, () => settle(null));
  channel.onNotification = (item) => {
    if (!disposed) notifications.value = [...notifications.value, item];
  };
  void channel.restore().then(() => {
    if (!disposed) notifications.value = channel.getHistory();
  });
  onScopeDispose(() => {
    disposed = true;
    channel.onNotification = undefined;
  });

  const applySettings = (compute: NotificationSettingsUpdate): void => {
    pending?.push(compute);
    settings.value = updateNotificationSettings(
      settings.value,
      compute(settings.value),
    );
    saveNotificationSettings(storage, settings.value);
  };
  const updateSettings = (update: Partial<NotificationSettings>): void =>
    applySettings(() => update);

  return {
    notifications,
    unreadCount,
    settings,
    addNotification: (item) => addInAppNotification(channel, item),
    clear: () => {
      channel.clear();
      notifications.value = [];
    },
    clearOne: (id) => {
      void clearOneInAppNotification(channel, id).then(() => {
        if (!disposed) notifications.value = channel.getHistory();
      });
    },
    markAsRead: (id) => {
      channel.markAsRead(id);
      notifications.value = notifications.value.map((item) =>
        item.id === id ? { ...item, read: true } : item,
      );
    },
    markAllAsRead: () => {
      channel.markAllAsRead();
      notifications.value = notifications.value.map((item) => ({
        ...item,
        read: true,
      }));
    },
    updateSettings,
    setChannels: (channels) => updateSettings(channelsUpdate(channels)),
    muteChain: (chainId) =>
      applySettings((current) => mutedChainSettings(current, chainId, true)),
    unmuteChain: (chainId) =>
      applySettings((current) => mutedChainSettings(current, chainId, false)),
  };
}
