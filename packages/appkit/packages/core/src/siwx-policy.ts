export interface SiwxLocation {
  host: string;
  origin: string;
}

export interface SiwxMessageLike {
  chainId: string;
  address: string;
  domain: string;
  issuedAt?: string | null;
  expirationTime?: string | null;
  notBefore?: string | null;
}

export interface SiwxResultLike<M extends SiwxMessageLike = SiwxMessageLike> {
  message: M;
  signature: string;
}

export function defaultSiwxDomain(location?: SiwxLocation): string {
  return location?.host ?? "localhost";
}

export function defaultSiwxUri(location?: SiwxLocation): string {
  return location?.origin ?? "http://localhost";
}

export function isSiwxExpired(result: SiwxResultLike, now: Date): boolean {
  const value = result.message.expirationTime;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

export function isSiwxNotBeforeValid(
  result: SiwxResultLike,
  now: Date,
): boolean {
  const value = result.message.notBefore;
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function randomSuffix(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function siwxResultToSession<M extends SiwxMessageLike>(
  result: SiwxResultLike<M>,
  now = new Date(),
) {
  return {
    id: `siwx_${now.getTime().toString(36)}_${randomSuffix()}`,
    chainId: result.message.chainId,
    address: result.message.address,
    domain: result.message.domain,
    message: result.message,
    signature: result.signature,
    issuedAt: result.message.issuedAt ?? now.toISOString(),
    expiresAt: result.message.expirationTime ?? null,
    refreshedAt: null,
  };
}
