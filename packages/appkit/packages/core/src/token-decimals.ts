/**
 * Decimals cache keyed by the token it belongs to.
 *
 * The ERC-20 hooks cached decimals in a bare `useRef` seeded from the token
 * prop. `useRef` only takes its initial value on mount, and nothing reset it,
 * so a component that lets the user switch tokens kept the first token's
 * precision: picking USDC (6) and then DAI (18) converted "100" with 6
 * decimals and transferred 0.0000000001 DAI. The transaction succeeded, so
 * nothing surfaced the mistake.
 *
 * Keying the cache by the token makes a stale hit impossible without needing
 * an effect to fire first.
 */

export interface TokenIdentity {
  chainId?: number;
  address: string;
}

export interface DecimalsCache {
  key: string;
  value: number | undefined;
}

export function tokenKey(token: TokenIdentity): string {
  return `${token.chainId ?? "?"}:${token.address.toLowerCase()}`;
}

export function createDecimalsCache(
  token: TokenIdentity,
  known?: number,
): DecimalsCache {
  return { key: tokenKey(token), value: known };
}

/**
 * Cached decimals for `token`, or undefined when the cache holds another
 * token's value. Resets the cache as a side effect so the next write lands
 * against the right key.
 */
export function readDecimals(
  cache: DecimalsCache,
  token: TokenIdentity,
  known?: number,
): number | undefined {
  const key = tokenKey(token);
  if (cache.key !== key) {
    cache.key = key;
    cache.value = known;
  }
  return cache.value;
}

export function writeDecimals(
  cache: DecimalsCache,
  token: TokenIdentity,
  value: number,
): void {
  cache.key = tokenKey(token);
  cache.value = value;
}
