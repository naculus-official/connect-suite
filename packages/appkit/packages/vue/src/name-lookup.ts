import { getResolver } from "@naculus/connect-appkit-core";
import type { NameResolver, NameResolverConfig } from "@naculus/connect-core";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, shallowRef, toValue, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface NameLookupReturn<T> {
  data: ShallowRef<T | null>;
  isLoading: ComputedRef<boolean>;
  error: ShallowRef<Error | null>;
  refetch: () => void;
}

interface NameLookupOptions<T> {
  input: MaybeRefOrGetter<string>;
  skip?: MaybeRefOrGetter<boolean | undefined>;
  resolverConfig?: MaybeRefOrGetter<NameResolverConfig | undefined>;
  scope?: MaybeRefOrGetter<string | undefined>;
  query: (
    resolver: NameResolver,
    input: string,
    scope?: string,
  ) => Promise<T | null>;
}

/** Shared race-safe lifecycle for forward and reverse name lookups. */
export function useNameLookup<T>(
  options: NameLookupOptions<T>,
): NameLookupReturn<T> {
  // loading stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const data = shallowRef<T | null>(null) as ShallowRef<T | null>;
  const loading = shallowRef(false);

  const run = (): void => {
    const input = toValue(options.input).trim();
    const skip = toValue(options.skip) ?? false;
    const scope = toValue(options.scope);
    const config = toValue(options.resolverConfig);
    if (!input || skip) {
      guard.reset();
      data.value = null;
      loading.value = false;
      return;
    }

    // Never show the previous name/address beside a new input while it loads.
    data.value = null;
    loading.value = true;
    void guard
      .run(
        async (commit) => {
          try {
            // The query still starts one microtask after the input change.
            const result = await Promise.resolve().then(() =>
              options.query(getResolver(config), input, scope),
            );
            commit(() => {
              data.value = result;
            });
          } catch (cause) {
            commit(() => {
              data.value = null;
            });
            throw cause;
          }
        },
        "Name lookup failed",
        (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
        {
          onSettled: () => {
            loading.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    () =>
      [
        toValue(options.input),
        toValue(options.skip),
        toValue(options.scope),
        toValue(options.resolverConfig),
      ] as const,
    run,
    { immediate: true, flush: "sync", deep: true },
  );

  return {
    data,
    isLoading: computed(() => loading.value),
    error: guard.error,
    refetch: run,
  };
}
