import { getClient } from "../client";
import type { Web3Client } from "../client";

/**
 * Resolve the provider-owned client while retaining compatibility with older
 * hook consumers that rendered outside Web3ConnectProvider.
 *
 * The provider value is always authoritative. The legacy accessor is only a
 * fallback for isolated hooks/tests and is never used when a provider client
 * is present, so multiple providers cannot share routing state accidentally.
 */
export function resolveClient(client?: Web3Client | null): Web3Client | null {
  return client ?? getClient();
}
