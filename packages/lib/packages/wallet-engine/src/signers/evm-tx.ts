/**
 * Re-exported from @naculus/connect-core/signing, where the EVM transaction
 * and EIP-7702 encoders now live so core can compute signing hashes itself.
 * Kept as a module so wallet-engine's internal imports stay unchanged.
 */
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
} from "@naculus/connect-core/signing";
