import { bareEvmAddress } from "@naculus/connect-appkit-core";
import {
  type DelegationStatus,
  readDelegation,
  UNKNOWN_DELEGATION,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, shallowRef, toValue, watch } from "vue";
import { useActionGuard } from "./internal/action-guard";

/** Minimal read-only contract; a viem PublicClient can supply getCode. */
export interface DelegationCodeReader {
  getCode(args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>;
}

export interface UseDelegationReturn {
  delegated: ComputedRef<boolean | null>;
  delegate: ComputedRef<`0x${string}` | null>;
  isFetching: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refetch: () => Promise<void>;
}

/** Read current EIP-7702 delegation without treating an unread account as undelegated. */
export function useDelegation(
  account: MaybeRefOrGetter<string | null | undefined>,
  client: MaybeRefOrGetter<DelegationCodeReader | null | undefined>,
  chainId?: MaybeRefOrGetter<string | null | undefined>,
): UseDelegationReturn {
  // isFetching stays newest-only rather than the guard's counted busy flag.
  const guard = useActionGuard();
  const status = shallowRef<DelegationStatus>(UNKNOWN_DELEGATION);
  const isFetching = shallowRef(false);

  const refetch = async (): Promise<void> => {
    const reader = toValue(client);
    const address = bareEvmAddress(toValue(account));
    status.value = UNKNOWN_DELEGATION;
    if (!reader || !address) {
      guard.reset();
      isFetching.value = false;
      return;
    }
    isFetching.value = true;
    await guard
      .run(
        async (commit) => {
          try {
            const code = await reader.getCode({ address });
            commit(() => {
              status.value = readDelegation(code ?? "0x");
            });
          } catch (cause) {
            commit(() => {
              status.value = UNKNOWN_DELEGATION;
            });
            throw cause;
          }
        },
        "Code read failed",
        undefined,
        {
          onSettled: () => {
            isFetching.value = false;
          },
        },
      )
      .catch(() => {});
  };

  watch(
    [() => toValue(account), () => toValue(client), () => toValue(chainId)],
    () => {
      void refetch();
    },
    { immediate: true, flush: "sync" },
  );

  return {
    delegated: computed(() => status.value.delegated),
    delegate: computed(() => status.value.delegate),
    isFetching,
    error: guard.error,
    refetch,
  };
}
