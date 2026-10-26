# Migration guide: 0.15 session-key signing and policy execution

This guide covers applications that use session keys from `@naculus/connect-core`, the wallet send path in `@naculus/wallet-engine`, or the appkit policy flow (`@naculus/connect-appkit-core`, `@naculus/connect-appkit-react`, `@naculus/connect-appkit-vue`).

## Who is affected

- **Session keys that sign with a caller-supplied digest.** Any call to `signWithSessionKey`, `signWithVerifiedOffchainAuthorization` or `signDelegationRedemption` now throws `session_key_scope_exceeded` for every key with rails. Since 0.14 every key has rails, so every such call is affected.
- **Code that reads the raw session key.** `getSessionBundle` refuses to return the private key of any session key (keys always carry rails since 0.14).
- **Appkit apps** that call `useSendWithSession().signWithSession`, `useDelegationPolicy().signPolicyDigest` with `(policyId, digest, tx)`, or write execution adapters whose `prepare` result has no `request`.
- **Apps that match the wallet's `invalid_input` error** for a malformed transaction on the session-key send path.

Apps that only use `checkScope`, `signTypedDataWithSessionKey`, or the wallet's `sendTransaction` with a valid transaction need no change.

## Why the raw-digest methods are refused

A raw digest is a 32-byte value the caller supplies. The scope check runs on a transaction the caller describes, and nothing ties the two together. Before 0.15, a key whose rails included only `transfer` could still sign such a digest, so a harmless `transfer(payee, 0)` could be checked while a transfer to someone else was signed. Rails keys now refuse every raw-digest path. The digest is derived inside connect-core from the transaction the scope check sees.

## Method mapping

| Before (0.14) | After (0.15) | Notes |
|---|---|---|
| `signWithSessionKey(sessionId, messageHash, tx)` | `signTransactionWithSessionKey(sessionId, tx)` | `tx` is a `TransactionRequest`; the digest is derived from it. |
| `signWithVerifiedOffchainAuthorization(sessionId, buildExpectedMessage, verify, messageHash, tx)` | `signTransactionWithVerifiedOffchainAuthorization(sessionId, buildExpectedMessage, verify, tx)` | The off-chain policy is revalidated under the same lock as signing. |
| `signDelegationRedemption(sessionId, digest, outerTx, execution)` | `signTransactionDelegationRedemption(sessionId, tx, outerTx, execution)` | `outerTx` is `{ gas?: string }`. If given, `gas` must equal `tx.gas`. |
| `getSessionBundle(sessionId)` | No replacement for rails keys | Refused for every session key. Use the transaction methods above. |
| `signTypedDataWithSessionKey(...)` | Unchanged | EIP-3009 typed data keeps its own checks. |

`TransactionRequest` is exported from the `@naculus/connect-core` root. Its hashing and encoding helpers are available from the `@naculus/connect-core/signing` subpath.

Before:

```ts
const signature = await manager.signWithSessionKey(sessionId, digest, {
  to,
  value,
  data,
  chainId,
  gas,
});
```

After:

```ts
import type { TransactionRequest } from "@naculus/connect-core";

const tx: TransactionRequest = {
  type: "eip1559",
  chainId,
  nonce,
  to,
  value,
  data,
  gas,
  maxFeePerGas,
  maxPriorityFeePerGas,
};
const signature = await manager.signTransactionWithSessionKey(sessionId, tx);
```

Sign the same `tx` that you broadcast. Do not build a second transaction for the signature.

Rules that still apply to the transaction methods:

- A plain transaction needs the `transfer` rail. A key with only `x402-exact` or `mpp-charge` cannot sign one.
- An eip7702 key signs only delegation redemptions, through `signTransactionDelegationRedemption`.
- `allowedRecipients` is enforced on the transaction methods, because the checked facts come from the signed transaction.

## Appkit: `useSendWithSession` no longer exposes `signWithSession`

`useSendWithSession` (React and Vue) now returns only `checkScope`. Remove calls to `signWithSession`, and sign through the connect-core manager with `signTransactionWithSessionKey` instead.

## Appkit: `signPolicyDigest` and `PreparedPolicyExecution`

`signPolicyDigest` takes the whole prepared execution. The digest is no longer accepted from the caller on its own.

`PreparedPolicyExecution` has a new required field, `request: TransactionRequest`. An execution adapter must return the exact transaction it will broadcast as `request`, and `digest` must equal `transactionSigningHash(request)`. For off-chain policies, signing refuses:

- a `digest` that does not equal the signing hash of `request` (`WalletError` `invalid_input`);
- a `request` whose `to`, `value`, `data` or `chainId` differ from `prepared.transaction`, the transaction the policy checked (`WalletError` `invalid_input`).

Both checks run before the session key is used.

Before:

```ts
const signature = await signPolicyDigest(policyId, digest, transaction);
```

After:

```ts
const signature = await signPolicyDigest(policyId, {
  digest, // must equal transactionSigningHash(request)
  request, // the exact TransactionRequest the adapter broadcasts
  transaction, // the SessionKeyTransaction the policy checked
  payload,
});
```

Adapter `prepare` before:

```ts
return { digest, transaction, payload };
```

Adapter `prepare` after:

```ts
return { digest, request, transaction, payload };
```

## Wallet send path: error code for a malformed transaction

When a session-key send receives a transaction that cannot be hashed, the wallet now throws a `WalletError` with code `session_key_invalid_input`. Previously the code was `invalid_input`.

Before:

```ts
catch (err) {
  if (err instanceof WalletError && err.code === "invalid_input") { ... }
}
```

After:

```ts
catch (err) {
  if (err instanceof WalletError && err.code === "session_key_invalid_input") { ... }
}
```

## Checklist

1. Replace each raw-digest call with the transaction-bound method in the table above.
2. Stop reading the raw key with `getSessionBundle`; it is refused for every session key.
3. Remove `signWithSession` from React and Vue code.
4. Change `signPolicyDigest` calls to the prepared-execution form, and add `request` to every adapter `prepare` result.
5. Update any handling of `invalid_input` on the session-key send path to `session_key_invalid_input`.
6. Re-create session keys that have no `rails`; see [MIGRATION-0.14.md](MIGRATION-0.14.md).
