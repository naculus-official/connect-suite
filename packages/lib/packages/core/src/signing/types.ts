/**
 * Transaction and EIP-7702 authorization request types, shared by the signing
 * primitives in this directory and by wallet-engine. Moved from
 * wallet-engine/src/signers/types.ts; wallet-engine re-exports these names so
 * its public surface is unchanged.
 */

export interface TransactionRequest {
  to: string;
  from?: string;
  value?: string;
  data?: string;
  gas?: string;
  nonce?: string;
  chainId?: number;

  // Legacy fee field
  gasPrice?: string;

  // EIP-1559 fee fields
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;

  // Explicit type hint (optional, auto-detected if omitted). "eip7702" is
  // never auto-detected: a type-4 transaction must say so.
  type?: "legacy" | "eip1559" | "eip7702";

  /** EIP-7702 only: owner-signed delegations carried by a type-4 transaction. */
  authorizationList?: SignedEip7702Authorization[];
}

/**
 * An EIP-7702 authorization before it is signed: "set the code of the signing
 * EOA to delegate to `address`, on `chainId`, at the EOA's nonce `nonce`".
 * `address` 0x000…0 clears an existing delegation.
 */
export interface Eip7702AuthorizationRequest {
  /** Decimal EIP-155 chain ID. 0 means "any chain" and is refused by default. */
  chainId: number;
  /** 20-byte delegate (implementation) address. */
  address: string;
  /** The authority's account nonce, as a canonical hex quantity. */
  nonce: string;
}

export interface SignedEip7702Authorization
  extends Eip7702AuthorizationRequest {
  yParity: 0 | 1;
  /** 32-byte hex. */
  r: `0x${string}`;
  /** 32-byte hex. */
  s: `0x${string}`;
}

export interface Eip7702AuthorizationOptions {
  /**
   * Allow `chainId: 0`, an authorization that is valid on every chain. One
   * signature then delegates the account everywhere it exists, so this is off
   * by default and deliberately named to stand out in review.
   */
  unsafeAllowAnyChainAuthorization?: boolean;
}
