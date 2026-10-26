import {
  type MppSessionChannel,
  type MppSessionFetch,
  type MppSessionFetchResult,
  type MppSessionForceCloseResult,
  type MppSessionReceipt,
  type MppSessionRequest,
  readCurrentMppSessionChannel,
  readMppRecoveryChannelId,
  readMppSessionReceipt,
} from "@naculus/connect-appkit-core";
import type { MaybeRef, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, unref, watch } from "vue";

export interface UseMppSessionReturn {
  fetch: MppSessionRequest;
  meter: { add(units: bigint): void };
  pending: ShallowRef<bigint>;
  channel: ShallowRef<MppSessionChannel | null>;
  lastReceipt: ShallowRef<MppSessionReceipt | null>;
  recoveryChannelId: ShallowRef<string | null>;
  isPending: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  close(): Promise<MppSessionFetchResult>;
  forceClose(): Promise<MppSessionForceCloseResult>;
  reset(): void;
}

/** Reactive state around an MPP session fetch built and owned by the app. */
export function useMppSession(
  session: MaybeRef<MppSessionFetch>,
): UseMppSessionReturn {
  const current = () => unref(session);
  const pending = shallowRef(current().meter.pending);
  const channel = shallowRef<MppSessionChannel | null>(
    readCurrentMppSessionChannel(current()),
  );
  const lastReceipt = shallowRef<MppSessionReceipt | null>(null);
  const recoveryChannelId = shallowRef<string | null>(null);
  const isPending = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let active = 0;
  let generation = 0;
  let epoch = 0;
  let disposed = false;
  watch(
    () => unref(session),
    (value) => {
      generation++;
      epoch++;
      active = 0;
      isPending.value = false;
      pending.value = value.meter.pending;
      channel.value = readCurrentMppSessionChannel(value);
      lastReceipt.value = null;
      recoveryChannelId.value = null;
      error.value = null;
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    generation++;
    epoch++;
  });

  const run = <T>(
    operation: (value: MppSessionFetch) => Promise<T>,
    publish?: (value: T) => void,
    clearsRecovery = false,
  ): Promise<T> => {
    const own = ++generation;
    const ownEpoch = epoch;
    const invokedSession = current();
    active++;
    isPending.value = true;
    error.value = null;
    return operation(invokedSession)
      .then((result) => {
        if (!disposed && ownEpoch === epoch) {
          publish?.(result);
          const currentChannel = readCurrentMppSessionChannel(invokedSession);
          channel.value = currentChannel;
          pending.value = invokedSession.meter.pending;
          if (clearsRecovery || !currentChannel) {
            recoveryChannelId.value = null;
          }
        }
        return result;
      })
      .catch((cause: unknown) => {
        const normalized =
          cause instanceof Error
            ? cause
            : new Error("MPP session operation failed");
        if (!disposed && ownEpoch === epoch) {
          const currentChannel = readCurrentMppSessionChannel(invokedSession);
          channel.value = currentChannel;
          pending.value = invokedSession.meter.pending;
          const recovery = readMppRecoveryChannelId(cause);
          if (recovery) recoveryChannelId.value = recovery;
          else if (!currentChannel) recoveryChannelId.value = null;
          if (own === generation) error.value = normalized;
        }
        throw normalized;
      })
      .finally(() => {
        if (ownEpoch === epoch) {
          active--;
          if (!disposed) isPending.value = active > 0;
        }
      });
  };

  const fetch: MppSessionRequest = (input, init) =>
    run(
      (value) => value(input, init),
      (result) => {
        const receipt = readMppSessionReceipt(result.receipt);
        if (receipt) lastReceipt.value = receipt;
      },
    );

  const close = () =>
    run(
      (value) => value.close(),
      (result) => {
        const receipt = readMppSessionReceipt(result.receipt);
        if (receipt) lastReceipt.value = receipt;
      },
      true,
    );

  const forceClose = () => run((value) => value.forceClose(), undefined, true);

  const add = (units: bigint): void => {
    try {
      current().meter.add(units);
      pending.value = current().meter.pending;
      error.value = null;
    } catch (cause) {
      const normalized =
        cause instanceof Error
          ? cause
          : new Error("MPP session operation failed");
      error.value = normalized;
      recoveryChannelId.value = readMppRecoveryChannelId(cause);
      throw normalized;
    }
  };

  return {
    fetch,
    meter: { add },
    pending,
    channel,
    lastReceipt,
    recoveryChannelId,
    isPending,
    error,
    close,
    forceClose,
    reset: () => {
      generation++;
      epoch++;
      // Calls from the old epoch no longer decrement the counter.
      active = 0;
      isPending.value = false;
      pending.value = current().meter.pending;
      channel.value = readCurrentMppSessionChannel(current());
      lastReceipt.value = null;
      recoveryChannelId.value = null;
      error.value = null;
    },
  };
}
