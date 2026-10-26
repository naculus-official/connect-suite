import type {
  ActiveSessionBundle,
  ChainSession,
  SessionManager,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, shallowRef, toValue, watch } from "vue";

export interface UseSessionReturn {
  session: ComputedRef<ActiveSessionBundle["walletSession"] | null>;
  chainSessions: ComputedRef<ChainSession[]>;
  activeChainId: ComputedRef<string | null>;
  isConnected: ComputedRef<boolean>;
  connectorId: ComputedRef<string | null>;
}

interface SessionSnapshot {
  session: ActiveSessionBundle["walletSession"] | null;
  chainSessions: ChainSession[];
  activeChainId: string | null;
  connectorId: string | null;
}

function readSession(
  manager: SessionManager | null | undefined,
): SessionSnapshot {
  const bundle = manager?.getActiveBundle();
  if (!bundle) {
    return {
      session: null,
      chainSessions: [],
      activeChainId: null,
      connectorId: null,
    };
  }
  return {
    session: bundle.walletSession,
    chainSessions: Array.from(bundle.chainSessions.values()),
    activeChainId: bundle.activeChainId,
    connectorId: bundle.walletSession.walletType,
  };
}

/** Reactively expose a caller-owned SessionManager's active bundle. */
export function useSession(
  manager: MaybeRefOrGetter<SessionManager | null | undefined>,
): UseSessionReturn {
  const snapshot = shallowRef<SessionSnapshot>(readSession(toValue(manager)));

  watch(
    () => toValue(manager),
    (current, _previous, onCleanup) => {
      const update = (): void => {
        snapshot.value = readSession(current);
      };
      update();
      if (!current) return;
      current.on("sessionConnected", update);
      current.on("sessionDisconnected", update);
      current.on("chainChanged", update);
      // CAIP-25 lifecycle (connect-core >= 0.2.6): the wallet narrowed or
      // ended the session without the app asking.
      current.on("sessionScopeChanged", update);
      current.on("sessionRevoked", update);
      onCleanup(() => {
        current.off("sessionConnected", update);
        current.off("sessionDisconnected", update);
        current.off("chainChanged", update);
        current.off("sessionScopeChanged", update);
        current.off("sessionRevoked", update);
      });
    },
    { immediate: true },
  );

  return {
    session: computed(() => snapshot.value.session),
    chainSessions: computed(() => snapshot.value.chainSessions),
    activeChainId: computed(() => snapshot.value.activeChainId),
    isConnected: computed(() => snapshot.value.session !== null),
    connectorId: computed(() => snapshot.value.connectorId),
  };
}
