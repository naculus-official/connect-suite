import type {
  SessionStorage,
  StorageAdapter,
  UniversalWalletSession,
} from "@naculus/connect-core";
import type { AsyncStorageLike } from "./types";

/** connect-core `StorageAdapter` over AsyncStorage, under a key prefix. */
export function asyncStorageAdapter(
  storage: AsyncStorageLike,
  prefix = "naculus:",
): StorageAdapter {
  const k = (key: string) => `${prefix}${key}`;
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await storage.getItem(k(key));
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await storage.setItem(k(key), JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      await storage.removeItem(k(key));
    },
    async clear(): Promise<void> {
      const keys = (await storage.getAllKeys()).filter((key) =>
        key.startsWith(prefix),
      );
      if (keys.length > 0) await storage.multiRemove(keys);
    },
    async has(key: string): Promise<boolean> {
      return (await storage.getItem(k(key))) !== null;
    },
    isAvailable(): boolean {
      return true;
    },
  };
}

/**
 * Where `Web3ConnectProvider` persists the connected session on React
 * Native (pass as `config.sessionStorage`); the web default is localStorage.
 */
export function asyncStorageSessionStorage(
  storage: AsyncStorageLike,
  key = "naculus_web3_session",
): SessionStorage {
  return {
    async load(): Promise<UniversalWalletSession | null> {
      const raw = await storage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as UniversalWalletSession;
      } catch {
        // An unreadable record is no session, not a crash at startup.
        await storage.removeItem(key);
        return null;
      }
    },
    async save(session: UniversalWalletSession): Promise<void> {
      await storage.setItem(key, JSON.stringify(session));
    },
    async clear(): Promise<void> {
      await storage.removeItem(key);
    },
  };
}
