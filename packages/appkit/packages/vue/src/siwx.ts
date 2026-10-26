import type { SiwxResultLike } from "@naculus/connect-appkit-core";

export interface SiwxSignInOptions {
  domain?: string;
  statement?: string;
  uri?: string;
  chainId?: string;
  expirySeconds?: number;
  resources?: string[];
  requestId?: string;
}

export type SiwxResult = SiwxResultLike;
export type SiwxSignInAction = (
  options?: SiwxSignInOptions,
) => Promise<SiwxResult>;

export interface SiwxSessionLike {
  id: string;
  chainId: string;
  address: string;
  domain: string;
  message: SiwxResult["message"];
  signature: string;
  issuedAt: string;
  expiresAt: string | null;
  refreshedAt: string | null;
}
