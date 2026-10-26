import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import type {
  ExecuteCallsAction,
  ExecutionRoute,
  PreviewExecutionAction,
} from "./eip5792";
import { useActionGuard } from "./internal/action-guard";

export interface UseExecuteCallsOptions {
  preview: MaybeRef<PreviewExecutionAction>;
  execute: MaybeRef<ExecuteCallsAction>;
  lastRoute: MaybeRefOrGetter<ExecutionRoute | null>;
  reset: MaybeRef<() => void>;
}

export interface UseExecuteCallsReturn {
  preview: PreviewExecutionAction;
  execute: ExecuteCallsAction;
  isExecuting: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  lastRoute: ComputedRef<ExecutionRoute | null>;
  reset: () => void;
}

/** Reactive state around a caller-owned EIP-5792 execution planner/action. */
export function useExecuteCalls(
  options: UseExecuteCallsOptions,
): UseExecuteCallsReturn {
  const guard = useActionGuard();

  const preview: PreviewExecutionAction = (callCount, atomicity) =>
    unref(options.preview)(callCount, atomicity);

  const execute: ExecuteCallsAction = (calls, atomicity) => {
    const invoke = unref(options.execute);
    return guard.run(() => invoke(calls, atomicity), "Execution failed");
  };

  const reset = (): void => {
    guard.reset();
    unref(options.reset)();
  };

  return {
    preview,
    execute,
    isExecuting: guard.busy,
    error: guard.error,
    lastRoute: computed(() => toValue(options.lastRoute)),
    reset,
  };
}
