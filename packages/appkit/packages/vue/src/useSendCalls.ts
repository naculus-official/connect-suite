import { errorMessage } from "@naculus/connect-appkit-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, onScopeDispose, shallowRef, toValue, unref } from "vue";
import type {
  CallsStatus,
  ExecutionStrategy,
  GetCallsStatusAction,
  SendCallsAction,
  ShowCallsStatusAction,
} from "./eip5792";

export type SendCallsStatus =
  | "idle"
  | "awaiting_approval"
  | "submitted"
  | "failed";

export interface UseSendCallsOptions {
  sendCalls: MaybeRef<SendCallsAction>;
  getCallsStatus: MaybeRef<GetCallsStatusAction>;
  showCallsStatus: MaybeRef<ShowCallsStatusAction>;
  execution?: MaybeRefOrGetter<ExecutionStrategy | null>;
}

export interface UseSendCallsReturn {
  sendCalls: SendCallsAction;
  getCallsStatus: GetCallsStatusAction;
  showCallsStatus: ShowCallsStatusAction;
  status: ShallowRef<SendCallsStatus>;
  error: ShallowRef<Error | null>;
  batchHash: ShallowRef<string | null>;
  callsStatus: ShallowRef<CallsStatus | null>;
  execution: ComputedRef<ExecutionStrategy | null>;
  isSending: ComputedRef<boolean>;
  reset: () => void;
}

/**
 * Reactive state around caller-owned EIP-5792 actions and execution policy.
 * This deliberately keeps two publication generations instead of using the
 * shared action guard: sending and status reads are independent channels, and
 * a late completion in either channel must not suppress or overwrite the
 * newest completion in the other.
 */
export function useSendCalls(options: UseSendCallsOptions): UseSendCallsReturn {
  const status = shallowRef<SendCallsStatus>("idle");
  const error = shallowRef<Error | null>(null);
  const batchHash = shallowRef<string | null>(null);
  const callsStatus = shallowRef<CallsStatus | null>(null);
  let sendGeneration = 0;
  let statusGeneration = 0;
  let disposed = false;

  const sendCalls: SendCallsAction = async (calls, input) => {
    const invoke = unref(options.sendCalls);
    const own = ++sendGeneration;
    status.value = "awaiting_approval";
    error.value = null;
    batchHash.value = null;
    try {
      const hash = await invoke(calls, input);
      if (!disposed && own === sendGeneration) {
        status.value = "submitted";
        batchHash.value = hash;
      }
      return hash;
    } catch (cause) {
      const normalized =
        cause instanceof Error ? cause : new Error(errorMessage(cause));
      if (!disposed && own === sendGeneration) {
        status.value = "failed";
        error.value = normalized;
      }
      throw normalized;
    }
  };

  const getCallsStatus: GetCallsStatusAction = async (hash) => {
    const invoke = unref(options.getCallsStatus);
    const own = ++statusGeneration;
    const result = await invoke(hash);
    if (!disposed && own === statusGeneration) callsStatus.value = result;
    return result;
  };

  const showCallsStatus: ShowCallsStatusAction = (hash) =>
    unref(options.showCallsStatus)(hash);

  const reset = (): void => {
    sendGeneration++;
    statusGeneration++;
    status.value = "idle";
    error.value = null;
    batchHash.value = null;
    callsStatus.value = null;
  };

  onScopeDispose(() => {
    disposed = true;
    sendGeneration++;
    statusGeneration++;
  });

  return {
    sendCalls,
    getCallsStatus,
    showCallsStatus,
    status,
    error,
    batchHash,
    callsStatus,
    execution: computed(() => toValue(options.execution) ?? null),
    isSending: computed(() => status.value === "awaiting_approval"),
    reset,
  };
}
