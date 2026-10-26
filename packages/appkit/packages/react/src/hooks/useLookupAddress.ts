import type {
  NameResolver,
  NameResolverConfig,
  NameResult,
} from "@naculus/connect-core";
import { useCallback } from "react";
import { useNameLookup } from "../core/name-lookup";

/**
 * Result of a reverse resolution query.
 */
export interface UseLookupAddressResult {
  /** Resolved name, or null if not found / not started. */
  data: NameResult | null;
  /** Whether the lookup is in progress. */
  isLoading: boolean;
  /** Error that occurred during lookup, if any. */
  error: Error | null;
  /** Manually trigger re-lookup of the current address. */
  refetch: () => void;
}

/**
 * Options for the useLookupAddress hook.
 */
export interface UseLookupAddressOptions {
  /** Chain to resolve against, CAIP-2. */
  chainId?: string;
  /** Whether to skip the lookup (e.g. if the input is incomplete). */
  skip?: boolean;
  /** Custom resolver configuration (overrides default RPC URLs). */
  resolverConfig?: NameResolverConfig;
}

/**
 * React hook to resolve a blockchain address to a human-readable name.
 *
 * Reverse resolution for ENS and SNS.
 *
 * @example
 * ```tsx
 * function AccountLabel({ address }) {
 *   const { data } = useLookupAddress(address);
 *   return <span>{data?.name ?? address}</span>;
 * }
 * ```
 */
export function useLookupAddress(
  address: string,
  options?: UseLookupAddressOptions,
): UseLookupAddressResult {
  const query = useCallback(
    (resolver: NameResolver, input: string, scope?: string) =>
      resolver.lookupAddress(input, scope),
    [],
  );

  return useNameLookup<NameResult>({
    input: address,
    skip: options?.skip,
    resolverConfig: options?.resolverConfig,
    scope: options?.chainId,
    query,
  });
}
