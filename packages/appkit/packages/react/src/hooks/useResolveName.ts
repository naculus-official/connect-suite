import type {
  AddressResult,
  NameResolver,
  NameResolverConfig,
} from "@naculus/connect-core";
import { useCallback } from "react";
import { useNameLookup } from "../core/name-lookup";

/**
 * Result of a name resolution query.
 */
export interface UseResolveNameResult {
  /** Resolved address, or null if not found / not started. */
  data: AddressResult | null;
  /** Whether the resolution is in progress. */
  isLoading: boolean;
  /** Error that occurred during resolution, if any. */
  error: Error | null;
  /** Manually trigger re-resolution of the current name. */
  refetch: () => void;
}

/**
 * Options for the useResolveName hook.
 */
export interface UseResolveNameOptions {
  /** Whether to skip resolution (e.g. if input is invalid). Default: false. */
  skip?: boolean;
  /** Custom resolver configuration (overrides default RPC URLs). */
  resolverConfig?: NameResolverConfig;
}

/**
 * React hook to resolve a human-readable name to a blockchain address.
 *
 * Supports ENS (.eth) and SNS (.sol) names.
 * Automatically detects the name service from the suffix.
 *
 * @example
 * ```tsx
 * function AddressInput() {
 *   const { data, isLoading, error } = useResolveName('vitalik.eth');
 *   return <div>{data?.address ?? 'Enter a name'}</div>;
 * }
 * ```
 */
export function useResolveName(
  name: string,
  options?: UseResolveNameOptions,
): UseResolveNameResult {
  const query = useCallback(
    (resolver: NameResolver, input: string) => resolver.resolveName(input),
    [],
  );

  return useNameLookup<AddressResult>({
    input: name,
    skip: options?.skip,
    resolverConfig: options?.resolverConfig,
    query,
  });
}
