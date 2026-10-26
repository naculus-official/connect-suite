/**
 * Shared NameResolver instance for the name-resolution hooks.
 *
 * useResolveName and useLookupAddress each carried an identical getResolver
 * with its own module-level singleton, so the two directions of the same
 * lookup ran against separate resolvers and separate caches. One definition,
 * one instance.
 */
import { NameResolver } from "@naculus/connect-core";
import type { NameResolverConfig } from "@naculus/connect-core";

let sharedResolver: NameResolver | null = null;

/**
 * @param config When supplied, returns a dedicated resolver rather than the
 *   shared one — a caller asking for specific settings must not be handed an
 *   instance configured by someone else.
 */
export function getResolver(config?: NameResolverConfig): NameResolver {
  if (config) return new NameResolver(config);
  if (!sharedResolver) sharedResolver = new NameResolver();
  return sharedResolver;
}

/** Test seam: drop the shared instance. */
export function __resetResolverForTests(): void {
  sharedResolver = null;
}
