import { describe, expect, it } from "vitest";
import { asyncStorageAdapter, asyncStorageSessionStorage } from "./storage";
import type { AsyncStorageLike } from "./types";

function memoryStorage(): AsyncStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys) => {
      for (const key of keys) data.delete(key);
    },
  };
}

describe("native storage adapters", () => {
  it("scopes clear to its prefix and reports missing values", async () => {
    const storage = memoryStorage();
    await storage.setItem("other:key", "keep");
    const adapter = asyncStorageAdapter(storage, "test:");
    await adapter.set("wallet", { id: 7 });
    expect(await adapter.get("wallet")).toEqual({ id: 7 });
    await adapter.clear();
    expect(await adapter.get("wallet")).toBeNull();
    expect(storage.data.get("other:key")).toBe("keep");
  });

  it("removes an unreadable stored session", async () => {
    const storage = memoryStorage();
    const sessions = asyncStorageSessionStorage(storage, "session");
    await storage.setItem("session", "{invalid json");
    expect(await sessions.load()).toBeNull();
    expect(storage.data.has("session")).toBe(false);
  });
});
