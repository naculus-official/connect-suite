import type { ShallowRef } from "vue";
import { onScopeDispose, shallowRef } from "vue";

export interface ActionRunOptions {
  /**
   * Leave the visible error in place when the call starts instead of
   * clearing it. The call still supersedes older ones, and its own failure
   * is still published.
   */
  keepError?: boolean;
  /**
   * Runs once the call has settled, only while it is still the newest and
   * the guard is not disposed: after its result was committed, or after its
   * error was published, in the same tick as that error. For loading flags
   * that must never read "done" before the error is visible.
   */
  onSettled?: () => void;
}

export interface ActionGuard {
  /** True while at least one guarded call is in flight. */
  busy: ShallowRef<boolean>;
  /** The most recent failure of the newest call; older failures are dropped. */
  error: ShallowRef<Error | null>;
  /**
   * Run `action`. Concurrency-counted busy flag; only the newest call may
   * publish an error; the error is rethrown so callers still see it. The
   * action receives `commit(write)`, which runs `write` only while this call
   * is still the newest and the guard is not disposed — for result state
   * (a status, a hash) that must not be written by a superseded call.
   */
  run<T>(
    action: (commit: (write: () => void) => void) => Promise<T>,
    fallbackMessage: string,
    normalizeError?: (cause: unknown) => Error,
    options?: ActionRunOptions,
  ): Promise<T>;
  /** Clear the visible error without invalidating an in-flight call. */
  clearError(): void;
  /** Forget the current error and stop any in-flight call from publishing. */
  reset(): void;
  /** Stop any in-flight call from publishing, keeping the visible error. */
  invalidate(): void;
  /** Permanently stop this guard from publishing state. */
  dispose(): void;
}

/**
 * The invocation guard every action-style composable needs, in one place.
 * Created inside a component scope; disposal is handled automatically.
 */
export function useActionGuard(): ActionGuard {
  const busy = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let active = 0;
  let generation = 0;
  let disposed = false;

  const run = async <T>(
    action: (commit: (write: () => void) => void) => Promise<T>,
    fallbackMessage: string,
    normalizeError?: (cause: unknown) => Error,
    options: ActionRunOptions = {},
  ): Promise<T> => {
    const own = ++generation;
    const commit = (write: () => void): void => {
      if (!disposed && own === generation) write();
    };
    active++;
    busy.value = true;
    if (!options.keepError) error.value = null;
    try {
      return await action(commit);
    } catch (cause) {
      const normalized = normalizeError
        ? normalizeError(cause)
        : cause instanceof Error
          ? cause
          : new Error(fallbackMessage);
      if (!disposed && own === generation) error.value = normalized;
      throw normalized;
    } finally {
      // A throwing onSettled rejects the call with its own error, but must
      // not leave the concurrency count (and so busy) stuck.
      try {
        if (options.onSettled) commit(options.onSettled);
      } finally {
        active--;
        if (!disposed) busy.value = active > 0;
      }
    }
  };

  const invalidate = (): void => {
    generation++;
  };
  const reset = (): void => {
    invalidate();
    error.value = null;
  };
  const clearError = (): void => {
    error.value = null;
  };

  const dispose = (): void => {
    disposed = true;
    generation++;
  };

  onScopeDispose(dispose);

  return { busy, error, run, clearError, reset, invalidate, dispose };
}
