---
"@naculus/connect-appkit-core": minor
"@naculus/connect-appkit-react": minor
"@naculus/connect-appkit-vue": minor
---

Breaking: `PreparedPolicyExecution` has a new required `request: TransactionRequest` field. Execution adapters must return the exact transaction they will broadcast as `request`, and `digest` must equal its signing hash; signing refuses any mismatch.

Breaking: `signPolicyDigest` now takes the `PreparedPolicyExecution` (with its `request`) instead of a bare `digest` and `tx`. Off-chain policies sign the request through connect-core's transaction-bound method, so the signed digest is derived from the transaction rather than trusted from the caller.
