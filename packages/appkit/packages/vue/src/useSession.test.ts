import type {
  ActiveSessionBundle,
  SessionManager,
} from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import { useSession } from "./useSession";

function makeManager() {
  const handlers = new Map<string, Set<() => void>>();
  let activeBundle: ActiveSessionBundle | null = null;
  const manager = {
    getActiveBundle: () => activeBundle,
    on(event: string, handler: () => void) {
      const listeners = handlers.get(event) ?? new Set<() => void>();
      listeners.add(handler);
      handlers.set(event, listeners);
    },
    off(event: string, handler: () => void) {
      handlers.get(event)?.delete(handler);
    },
  };
  return {
    manager: manager as unknown as SessionManager,
    setBundle(bundle: ActiveSessionBundle | null) {
      activeBundle = bundle;
    },
    emit(event: string) {
      for (const listener of handlers.get(event) ?? []) listener();
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0;
    },
  };
}

function makeBundle(chainId = "eip155:1"): ActiveSessionBundle {
  return {
    walletSession: { walletType: "eip6963" },
    chainSessions: new Map(),
    activeChainId: chainId,
  } as unknown as ActiveSessionBundle;
}

describe("useSession", () => {
  it("tracks connection, active chain, and disconnect events", () => {
    const source = makeManager();
    const scope = effectScope();
    const result = scope.run(() => useSession(source.manager));
    if (!result) throw new Error("No composable result");
    expect(result.isConnected.value).toBe(false);
    expect(result.chainSessions.value).toEqual([]);

    const bundle = makeBundle();
    source.setBundle(bundle);
    source.emit("sessionConnected");
    expect(result.session.value).toBe(bundle.walletSession);
    expect(result.connectorId.value).toBe("eip6963");
    expect(result.activeChainId.value).toBe("eip155:1");

    bundle.activeChainId = "eip155:137";
    source.emit("chainChanged");
    expect(result.activeChainId.value).toBe("eip155:137");

    source.setBundle(null);
    source.emit("sessionDisconnected");
    expect(result.isConnected.value).toBe(false);
    expect(result.session.value).toBeNull();
    scope.stop();
    expect(source.listenerCount("chainChanged")).toBe(0);
  });

  it("detaches the previous manager when the source switches", async () => {
    const first = makeManager();
    const second = makeManager();
    const manager = shallowRef<SessionManager | null>(first.manager);
    const scope = effectScope();
    const result = scope.run(() => useSession(manager));
    if (!result) throw new Error("No composable result");

    second.setBundle(makeBundle("eip155:10"));
    manager.value = second.manager;
    await nextTick();
    expect(first.listenerCount("sessionConnected")).toBe(0);
    expect(result.activeChainId.value).toBe("eip155:10");

    first.setBundle(makeBundle("eip155:8453"));
    first.emit("sessionConnected");
    expect(result.activeChainId.value).toBe("eip155:10");
    scope.stop();
    expect(second.listenerCount("sessionConnected")).toBe(0);
  });
});
