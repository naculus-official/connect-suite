import type { AddressResult, NameResolverConfig } from "@naculus/connect-core";
import type { MaybeRefOrGetter } from "vue";
import { type NameLookupReturn, useNameLookup } from "./name-lookup";

export type UseResolveNameReturn = NameLookupReturn<AddressResult>;

/** Resolve a reactive ENS or SNS name to an address. */
export function useResolveName(
  name: MaybeRefOrGetter<string>,
  options?: {
    skip?: MaybeRefOrGetter<boolean | undefined>;
    resolverConfig?: MaybeRefOrGetter<NameResolverConfig | undefined>;
  },
): UseResolveNameReturn {
  return useNameLookup({
    input: name,
    skip: options?.skip,
    resolverConfig: options?.resolverConfig,
    query: (resolver, input) => resolver.resolveName(input),
  });
}
