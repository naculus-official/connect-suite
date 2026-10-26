// Signing primitives for EVM transactions and EIP-7702 authorizations. Exposed
// as the "./signing" subpath so the crypto worker can bundle just this slice.
export {
  assembleSignedTransaction,
  authorizationHash,
  serializeSignedTransaction,
  signedAuthorization,
  snapshotAuthorization,
  snapshotTransaction,
  TransactionInputError,
  type TransactionSignature,
  transactionSignature,
  transactionSigningHash,
} from "./evm-tx";
export {
  encodeRlpList,
  hexToBytes,
  toRlpBytes,
  toRlpQuantity,
} from "./rlp";
export type {
  Eip7702AuthorizationOptions,
  Eip7702AuthorizationRequest,
  SignedEip7702Authorization,
  TransactionRequest,
} from "./types";
