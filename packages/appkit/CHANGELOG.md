# Changelog

All notable changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 0.15.0 — 2026-10-26

Breaking release for connect-appkit. All six packages release in lockstep at 0.15.0 with connect-lib 0.15.0. Unpublished 0.14.2 changes are folded into this release. Migration: see connect-lib `docs/MIGRATION-0.15.md`.

### Breaking

- **`useSendWithSession` no longer exposes `signWithSession`** (`@naculus/connect-appkit-react`, `@naculus/connect-appkit-vue`) — the hook now provides only `checkScope`. The removed method called the raw-digest `signWithSessionKey`, which connect-core refuses for every key with rails. Sign transactions with connect-core's `SessionKeyManager.signTransactionWithSessionKey()` instead.
- **`signPolicyDigest` takes the prepared execution** (`@naculus/connect-appkit-core`, `@naculus/connect-appkit-react`, `@naculus/connect-appkit-vue`) — the signature is now `signPolicyDigest(policyId, prepared)` instead of `signPolicyDigest(policyId, digest, tx)`.
- **`PreparedPolicyExecution.request` is required** (`@naculus/connect-appkit-core`) — a new `request: TransactionRequest` field must hold the exact transaction the adapter will broadcast, and `digest` must equal its signing hash. For off-chain policies, signing refuses a `digest` that does not match `request` (`WalletError` `invalid_input`, before any key is used), and refuses a `request` whose `to`, `value`, `data` or `chainId` differ from the transaction the policy checked. Adapters must add `request` to every `prepare` result.
- Off-chain policy signing now runs through connect-core's `signTransactionWithVerifiedOffchainAuthorization`, so the digest is derived from `request` inside connect-core.

### Fixed

- React Native: `AuthorizationConsentNative` and `AuthorizationListNative` wrap their literal text in `<Text>`. React Native throws on text outside `<Text>`, so these screens could fail to render.

### Version bump only

- Build and lint configuration: Stencil `tsconfig` include and Biome schema 2.6.3.
- Test files were reformatted by lint; their assertions are unchanged.
- Dependency ranges on connect-lib packages move to `^0.15.0`.

## 0.14.0 — 2026-10-25

- **Breaking, inherited from connect-lib 0.14.0:** a passphrase is required for wallet storage in every runtime; `rails` are required in session key scopes and grants. See connect-lib `docs/MIGRATION-0.14.md`.
- Dependency move to `@naculus/connect-core` `^0.14.0`; this release follows connect-lib 0.14.0.
- All six packages release in lockstep at 0.14.0.

## [0.13.0] - 2026-10-19

- **Breaking, inherited from connect-lib 0.13.0:** a session-key scope that should sign x402 exact or MPP charge payments must list them in `rails`; a scope without `rails` refuses EIP-3009 signing. The shared session-key manager in `@naculus/connect-appkit-core` passes scopes through unchanged, so apps must re-create affected grants. See the connect-lib 0.13.0 changelog for the security fixes in this line.
- All six packages require connect-lib 0.13: every connect-lib dependency and peer range moves from `^0.12.0` to `^0.13.0`.
- `@naculus/connect-appkit-core`, `@naculus/connect-appkit-react`, `@naculus/connect-appkit-ui`, `@naculus/connect-appkit-vue`, `@naculus/connect-appkit-wc`, and `@naculus/connect-native`: no appkit source changes; version bump with the new connect-lib range.
- All six packages release in lockstep at 0.13.0.

## [0.12.1] - 2026-10-11

- `@naculus/connect-appkit-react`: remove the unused optional UI dependency, so React consumers do not install UI assets automatically. Users who need UI components must explicitly install `@naculus/connect-appkit-ui`.
- `@naculus/connect-appkit-ui`: update lucide-react to 1.52.0.
- Development tooling: align Storybook and its React/Vite adapter at 10.6.1; update jscpd to 5.4.0.
- `@naculus/connect-appkit-core`, `@naculus/connect-appkit-vue`, `@naculus/connect-appkit-wc`, and `@naculus/connect-native`: version bump only.
- All six packages release in lockstep at 0.12.1; connect-lib dependency ranges remain ^0.12.0.
