/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";

// Re-create a minimal SessionStorage adapter for testing
class TestStorage {
  private store = new Map<string, string>();

  async save(key: string, data: unknown): Promise<void> {
    this.store.set(key, JSON.stringify(data));
  }

  async load<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw ? JSON.parse(raw) as T : null;
  }

  async clear(key?: string): Promise<void> {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }
}

describe("SessionStorage adapter", () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = new TestStorage();
  });

  it("saves and loads session data", async () => {
    const session = {
      id: "test-session",
      walletType: "eip6963",
      namespaces: { "eip155": { accounts: ["0x123"], chains: ["eip155:1"] } }
    };
    await storage.save("test-key", session);
    const loaded = await storage.load("test-key");
    expect(loaded).toEqual(session);
  });

  it("returns null for missing key", async () => {
    const loaded = await storage.load("nonexistent");
    expect(loaded).toBe(null);
  });

  it("clears specific key", async () => {
    await storage.save("key1", { data: "a" });
    await storage.save("key2", { data: "b" });
    await storage.clear("key1");

    expect(await storage.load("key1")).toBe(null);
    expect(await storage.load("key2")).toEqual({ data: "b" });
  });

  it("clears all keys", async () => {
    await storage.save("key1", { data: "a" });
    await storage.save("key2", { data: "b" });
    await storage.clear();

    expect(await storage.load("key1")).toBe(null);
    expect(await storage.load("key2")).toBe(null);
  });

  it("handles complex nested session objects", async () => {
    const complexSession = {
      id: "complex",
      walletType: "walletconnect",
      namespaces: {
        "eip155": {
          accounts: ["eip155:1:0x123", "eip155:137:0x456"],
          chains: ["eip155:1", "eip155:137"],
          methods: ["eth_sendTransaction", "personal_sign"],
          events: ["accountsChanged", "chainChanged"]
        },
        "solana": {
          accounts: ["solana:5eykt4UsFv8P2mXoBxQdUxXo3QRnkBCSgXVM6KZRBBezZMQn"],
          chains: ["solana:5eykt4UsFv8P2mXoBxQdUxXo3QRnkBCSgXVM6KZRBBezZMQn"],
          methods: ["solana_signMessage"],
          events: []
        }
      }
    };
    await storage.save("complex", complexSession);
    const loaded = await storage.load("complex");
    expect(loaded).toEqual(complexSession);
  });

  it("handles binary-like hex data in session", async () => {
    const sessionWithHex = {
      id: "0x" + "ab".repeat(32),
      signature: "0x" + "cd".repeat(65),
      rawTx: "0x" + "ef".repeat(100)
    };
    await storage.save("hex-session", sessionWithHex);
    const loaded = await storage.load("hex-session");
    expect(loaded).toEqual(sessionWithHex);
  });
});
