import type {
  Eip7702AuthorizationOptions as CoreEip7702AuthorizationOptions,
  Eip7702AuthorizationRequest as CoreEip7702AuthorizationRequest,
  SignedEip7702Authorization as CoreSignedEip7702Authorization,
  TransactionRequest as CoreTransactionRequest,
} from "@naculus/connect-core/signing";

// The transaction and EIP-7702 request types are defined once in connect-core
// (signing/types.ts). These local interfaces extend them so wallet-engine keeps
// declaring the names itself, which keeps its published declarations unchanged.
export interface TransactionRequest extends CoreTransactionRequest {}
export interface Eip7702AuthorizationRequest
  extends CoreEip7702AuthorizationRequest {}
export interface SignedEip7702Authorization
  extends CoreSignedEip7702Authorization {}
export interface Eip7702AuthorizationOptions
  extends CoreEip7702AuthorizationOptions {}

export interface SignRequest {
  /** Raw message to sign (e.g., for personal_sign, the message string) */
  message: string;
  /** Optional chain context */
  chainId?: string;
  /** Optional address to sign with (for multi-account wallets) */
  address?: string;
}

export interface SignResult {
  /** The signature as hex string (with 0x prefix) */
  signature: `0x${string}`;
  /** Optional recovery id */
  recovery?: number;
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  chainId: string;

  // Fee info recorded on the result
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

/** `PocketWallet.sendDelegation`: the type-4 transaction and what it carried. */
export interface DelegationTransactionResult extends TransactionResult {
  authorization: SignedEip7702Authorization;
}

/** Abstract signer interface for blockchain-specific signing */
export interface Signer {
  readonly chainType: string;
  signMessage(req: SignRequest, privateKey: `0x${string}`): Promise<SignResult>;
  signTransaction(
    req: TransactionRequest,
    privateKey: `0x${string}`,
    publicKey?: string,
  ): Promise<SignResult>;
  /** Sign EIP-712 typed structured data (JSON stringified). Returns 65-byte signature. */
  signTypedData?(
    typedData: string,
    privateKey: `0x${string}`,
  ): Promise<SignResult>;
  /**
   * Sign a 32-byte digest as an EIP-191 message.
   *
   * Distinct from `signMessage`, which prefixes the UTF-8 text it is given.
   * Handing it a hash as a hex string signs the 66 characters "0x1234…", not
   * the 32 bytes they denote, and the two produce different signatures.
   *
   * This is the primitive ERC-4337 needs: SimpleAccount validates a
   * UserOperation by applying `toEthSignedMessageHash` to the userOpHash and
   * recovering the owner, so the signature has to cover
   * keccak256("\x19Ethereum Signed Message:\n32" ‖ hash).
   */
  signHash?(
    hash: `0x${string}`,
    privateKey: `0x${string}`,
  ): Promise<SignResult>;
  /**
   * Sign an EIP-7702 authorization: the raw secp256k1 signature over
   * keccak256(0x05 ‖ rlp([chainId, address, nonce])), with no EIP-191 prefix.
   */
  signAuthorization?(
    auth: Eip7702AuthorizationRequest,
    privateKey: `0x${string}`,
    options?: Eip7702AuthorizationOptions,
  ): Promise<SignedEip7702Authorization>;
}
