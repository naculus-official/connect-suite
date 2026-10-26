import type { NameResolverConfig, NameResult } from "@naculus/connect-core";
import type { MaybeRefOrGetter } from "vue";
import { type NameLookupReturn, useNameLookup } from "./name-lookup";

export type UseLookupAddressReturn = NameLookupReturn<NameResult>;

/** Reverse-resolve a reactive address, optionally scoped to a CAIP-2 chain. */
export function useLookupAddress(
  address: MaybeRefOrGetter<string>,
  options?: {
    chainId?: MaybeRefOrGetter<string | undefined>;
    skip?: MaybeRefOrGetter<boolean | undefined>;
    resolverConfig?: MaybeRefOrGetter<NameResolverConfig | undefined>;
  },
): UseLookupAddressReturn {
  return useNameLookup({
    input: address,
    scope: options?.chainId,
    skip: options?.skip,
    resolverConfig: options?.resolverConfig,
    query: (resolver, input, scope) => resolver.lookupAddress(input, scope),
  });
}
