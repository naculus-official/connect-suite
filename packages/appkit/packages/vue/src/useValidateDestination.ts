import {
  type DestinationValidation,
  validateDestination,
} from "@naculus/connect-appkit-core";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, toValue } from "vue";

export interface UseValidateDestinationReturn {
  validation: ComputedRef<DestinationValidation>;
}

/**
 * Syntactic destination checks, shared with the React hook through
 * `@naculus/connect-appkit-core`. Returns a machine-readable `issue`; the
 * Vue package carries no locale table, so the caller maps it to a string.
 * `level: "ok"` means nothing wrong was found — not that it is safe.
 */
export function useValidateDestination(
  address: MaybeRefOrGetter<string | null | undefined>,
): UseValidateDestinationReturn {
  return {
    validation: computed(() => validateDestination(toValue(address) ?? "")),
  };
}
