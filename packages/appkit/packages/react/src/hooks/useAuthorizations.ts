import {
  type AuthorizationManagers,
  type ListedAuthorization,
  listAuthorizations,
  type RevokeListedAuthorizationResult,
  revokeListedAuthorization,
} from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseAuthorizationsOptions {
  managers: AuthorizationManagers;
}

export interface UseAuthorizationsReturn {
  entries: ListedAuthorization[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  revoke: (
    entry: ListedAuthorization,
  ) => Promise<RevokeListedAuthorizationResult>;
}

/** Reactive shell over the caller-owned authorization managers. */
export function useAuthorizations({
  managers,
}: UseAuthorizationsOptions): UseAuthorizationsReturn {
  const managersRef = useRef(managers);
  managersRef.current = managers;
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const [entries, setEntries] = useState<ListedAuthorization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
      generationRef.current += 1;
    },
    [],
  );

  const refresh = useCallback(async () => {
    const own = ++generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listAuthorizations(managersRef.current);
      if (mountedRef.current && own === generationRef.current) setEntries(next);
    } catch (cause) {
      if (mountedRef.current && own === generationRef.current) {
        setError(
          cause instanceof Error
            ? cause
            : new Error("Failed to list authorizations"),
        );
      }
    } finally {
      if (mountedRef.current && own === generationRef.current)
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = useCallback(
    async (entry: ListedAuthorization) => {
      try {
        const result = await revokeListedAuthorization(
          managersRef.current,
          entry,
        );
        await refresh();
        return result;
      } catch (cause) {
        const normalized =
          cause instanceof Error
            ? cause
            : new Error("Failed to revoke authorization");
        if (mountedRef.current) setError(normalized);
        throw normalized;
      }
    },
    [refresh],
  );

  return { entries, loading, error, refresh, revoke };
}
