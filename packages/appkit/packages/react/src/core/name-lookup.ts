/**
 * The shared half of the two name-resolution hooks.
 *
 * `useResolveName` (name to address) and `useLookupAddress` (address to name)
 * were near-identical copies, and carried identical defects:
 *
 * - No request-generation guard. Typing quickly meant two lookups in flight,
 *   and if the earlier one resolved last it overwrote the later result — the
 *   UI then showed one address's name next to a different address, which is
 *   exactly the pairing a user reads before deciding where to send funds.
 * - The resolver was captured into a ref on first render and never rebuilt, so
 *   a caller changing `resolverConfig` kept querying through the old one.
 * - The de-duplication guard closed over `data` without listing it as a
 *   dependency, so it tested a value from an earlier render.
 *
 * Keeping the logic here means fixing it once. The two hooks differ only in
 * which resolver method they call and what they call the input.
 */

import type { NameResolver, NameResolverConfig } from "@naculus/connect-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getResolver } from "@naculus/connect-appkit-core";

export interface NameLookupState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface NameLookupOptions<T> {
  /** The name or address being looked up. */
  input: string;
  /** Skip entirely, e.g. while the input is known to be incomplete. */
  skip?: boolean;
  /** Overrides the shared resolver when supplied. */
  resolverConfig?: NameResolverConfig;
  /** Extra value that changes the query's meaning, such as a chain ID. */
  scope?: string;
  /**
   * Performs the lookup. Must be stable or wrapped by the caller.
   *
   * Resolves null for "no such name", which is an answer rather than a
   * failure and is reported as `data: null` with no error.
   */
  query: (
    resolver: NameResolver,
    input: string,
    scope?: string,
  ) => Promise<T | null>;
}

export function useNameLookup<T>({
  input,
  skip = false,
  resolverConfig,
  scope,
  query,
}: NameLookupOptions<T>): NameLookupState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Rebuilt when the config changes rather than pinned to the first render.
  // getResolver returns a dedicated instance for a config and the shared one
  // otherwise, so this stays a single instance for the common case.
  const resolver = useMemo(() => getResolver(resolverConfig), [resolverConfig]);

  const run = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || skip) {
      // Bump the generation so a lookup already in flight cannot land after
      // the caller has cleared the field.
      generationRef.current += 1;
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const generation = ++generationRef.current;
    setIsLoading(true);
    setError(null);

    query(resolver, trimmed, scope)
      .then((result) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setData(result);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
        setIsLoading(false);
      });
  }, [input, skip, scope, resolver, query]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, isLoading, error, refetch: run };
}
