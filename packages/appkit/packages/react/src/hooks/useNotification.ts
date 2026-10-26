/**
 * useNotification — React hook for push notification state.
 *
 * Provides notifications, settings, and control methods for the
 * in-app notification center.
 *
 * @example
 * ```tsx
 * import { useNotification } from "@naculus/connect-appkit-react";
 *
 * function NotificationCenter() {
 *   const { notifications, unreadCount, clear, markAsRead } = useNotification();
 *   return (
 *     <div>
 *       <span>Unread: {unreadCount}</span>
 *       <ul>
 *         {notifications.map(n => (
 *           <li key={n.id} onClick={() => markAsRead(n.id)}>
 *             {n.title} — {n.body}
 *           </li>
 *         ))}
 *       </ul>
 *       <button onClick={clear}>Clear all</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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

// ─── Hook ──────────────────────────────────────────────────────────────

/**
 * Hook for consuming in-app notifications in React components.
 *
 * Uses InAppChannel internally to manage the notification queue.
 * All persistent state is stored via localStorage.
 */
export function useNotification(options?: {
  /** External InAppChannel instance (for sharing between hooks). If omitted, creates one. */
  channel?: InAppChannel;
  /** Custom storage for settings (defaults to localStorage) */
  storage?: NotificationSettingsStorage;
}) {
  // ── Channel ──────────────────────────────────────────────────────

  const channelRef = useRef<InAppChannel | null>(null);

  if (!channelRef.current) {
    channelRef.current = options?.channel ?? new InAppChannel();
  }

  const channel = channelRef.current;

  // ── State ────────────────────────────────────────────────────────

  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    channel.getHistory(),
  );

  const [settings, setSettingsState] = useState<NotificationSettings>(() => {
    // Try to load from storage, fall back to default
    return DEFAULT_NOTIFICATION_SETTINGS;
  });

  // ── Load persisted settings on mount ──────────────────────────────

  // Changes made before the persisted settings load are queued and replayed
  // on top of them (replayNotificationSettings); null once loaded.
  const pendingRef = useRef<NotificationSettingsUpdate[] | null>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads persisted settings once, on mount; later storage changes are written, not re-read
  useEffect(() => {
    const storage = options?.storage ?? createNotificationSettingsStorage();
    const settle = (saved: NotificationSettings | null) => {
      const pending = pendingRef.current ?? [];
      pendingRef.current = null;
      if (pending.length === 0) {
        if (saved) setSettingsState(saved);
        return;
      }
      setSettingsState(() => {
        const next = replayNotificationSettings(saved, pending);
        saveNotificationSettings(storage, next);
        return next;
      });
    };
    loadNotificationSettings(storage).then(settle, () => settle(null));
  }, []);

  // ── Sync notifications with channel ──────────────────────────────

  // biome-ignore lint/correctness/useExhaustiveDependencies: channel comes from a ref and never changes; wired once on mount
  useEffect(() => {
    // Set up callback to reactively update state when new notifications arrive
    channel.onNotification = (item) => {
      setNotifications((prev) => [...prev, item]);
    };

    // Restore persisted history
    channel.restore().then(() => {
      setNotifications(channel.getHistory());
    });

    return () => {
      // Cleanup: deregister callback on unmount
      channel.onNotification = undefined;
    };
  }, []);

  // ── Computed ─────────────────────────────────────────────────────

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // ── Actions ──────────────────────────────────────────────────────

  const clear = useCallback(() => {
    channel.clear();
    setNotifications([]);
  }, [channel]);

  const clearOne = useCallback(
    (id: string) => {
      clearOneInAppNotification(channel, id).then(() => {
        // Force re-sync
        setNotifications(channel.getHistory());
      });
    },
    [channel],
  );

  const markAsRead = useCallback(
    (id: string) => {
      channel.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
    },
    [channel],
  );

  const markAllAsRead = useCallback(() => {
    channel.markAllAsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [channel]);

  // ── Add single notification ──────────────────────────────────────

  const addNotification = useCallback(
    (item: Omit<NotificationItem, "id" | "timestamp">) => {
      addInAppNotification(channel, item);
      // The onNotification callback will update state
    },
    [channel],
  );

  // ── Settings ──────────────────────────────────────────────────────

  // Every change is computed from the latest state inside the updater, never
  // from the `settings` captured at render: two calls in one tick (mute A,
  // mute B) would otherwise both start from the same list, and the second
  // would drop the first.
  const applySettings = useCallback(
    (compute: NotificationSettingsUpdate) => {
      pendingRef.current?.push(compute);
      setSettingsState((prev) => {
        const next = updateNotificationSettings(prev, compute(prev));
        const storage = options?.storage ?? createNotificationSettingsStorage();
        saveNotificationSettings(storage, next);
        return next;
      });
    },
    [options?.storage],
  );

  const updateSettings = useCallback(
    (update: Partial<NotificationSettings>) => applySettings(() => update),
    [applySettings],
  );

  const setChannels = useCallback(
    (channels: string[]) => {
      updateSettings(channelsUpdate(channels));
    },
    [updateSettings],
  );

  const muteChain = useCallback(
    (chainId: string) => {
      applySettings((prev) => mutedChainSettings(prev, chainId, true));
    },
    [applySettings],
  );

  const unmuteChain = useCallback(
    (chainId: string) => {
      applySettings((prev) => mutedChainSettings(prev, chainId, false));
    },
    [applySettings],
  );

  // ── Return ───────────────────────────────────────────────────────

  return {
    /** All in-app notifications (newest last) */
    notifications,
    /** Number of unread notifications */
    unreadCount,
    /** Add a single notification manually */
    addNotification,
    /** Clear all in-app notifications */
    clear,
    /** Clear a single notification */
    clearOne,
    /** Mark a notification as read */
    markAsRead,
    /** Mark all as read */
    markAllAsRead,
    /** Current notification settings */
    settings,
    /** Update notification settings */
    updateSettings,
    /** Set active channels by id */
    setChannels,
    /** Mute a chain */
    muteChain,
    /** Unmute a chain */
    unmuteChain,
  };
}
