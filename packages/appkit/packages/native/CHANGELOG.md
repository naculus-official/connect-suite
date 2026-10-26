# @naculus/connect-native

## 0.14.2 — 2026-10-26

- First release from the connect-suite monorepo. connect-lib dependency range moves to `^0.14.2`.
- Fix: `AuthorizationConsentNative` and `AuthorizationListNative` wrap literal text in `<Text>`; React Native throws on text outside `<Text>`.

## 0.14.1 — 2026-10-25

### Patch Changes

- Depend on connect-lib 0.14 everywhere: all @naculus/* dependencies move from ^0.13.0 to ^0.14.0. 0.14.0 shipped with connector, wallet-engine, siwx and payment packages still on ^0.13.0, which mixed 0.13 and 0.14 code.

## 0.14.0

### Minor Changes

- Require connect-lib 0.14: `@naculus/connect-core` range moves from `^0.13.0` to `^0.14.0`.
  Breaking changes are inherited from connect-lib 0.14.0: wallet storage requires an `encryptionPassphrase` in every runtime, and session-key scopes and grants must list valid, distinct `rails`. See connect-lib `docs/MIGRATION-0.14.md`.

## 0.13.0

### Minor Changes

- Require connect-lib 0.13: every `@naculus/connect-*`, connector, payments, siwx and wallet-engine range moves from `^0.12.0` to `^0.13.0`.
  
  Breaking, inherited from connect-lib 0.13.0: a session-key scope that should sign x402 exact or MPP charge payments must now list them in `rails`; a scope without `rails` refuses EIP-3009 signing. The shared session-key manager passes scopes through unchanged, so re-create affected grants. See the connect-lib 0.13.0 changelog.

### Patch Changes

- Updated dependencies
  - @naculus/connect-appkit-core@0.13.0
  - @naculus/connect-appkit-react@0.13.0

## 0.12.1

### Patch Changes

- Version bump only to keep all appkit packages in lockstep at 0.12.1.

## 0.12.0

### Minor Changes

- Require connect-lib 0.12 (`@naculus/connect` and its packages). Every connect-lib dependency and peer range is now `^0.12.0` (0.12 makes `MppSessionPolicy.mint` required; see the connect-lib 0.12.0 changelog). Install connect-lib 0.12 alongside this release.

### Patch Changes

- Updated dependencies [12ae163]
- Updated dependencies
  - @naculus/connect-appkit-core@0.12.0
  - @naculus/connect-appkit-react@0.12.0

## 0.11.1

### Patch Changes

- Require connect-lib 0.11. Every `@naculus/*` connect-lib dependency and peer range is now `^0.11.0` (was `^0.10.0`, which in 0.x excludes 0.11.0). With appkit 0.11.0, installing `@naculus/connect-core@0.11.0` next to it left several copies of `@naculus/connect-core` (0.10.0 nested under the connectors, 0.11.0 at the root). connect-lib packages pin each other to one exact version, so appkit cannot span two lib minors: with 0.11.1, a project still on connect-lib 0.10 gets an explicit npm ERESOLVE instead of duplicate copies; upgrade every `@naculus/*` connect-lib package to 0.11. No code change; `@naculus/connect-appkit-wc` is version bump only.
- Updated dependencies
  - @naculus/connect-appkit-core@0.11.1
  - @naculus/connect-appkit-react@0.11.1

## 0.11.0

### Minor Changes

- 2ab054a: Show periodic authorization limits and whether the blockchain or the current device enforces them across shared descriptions, web components, and React Native components. Require connect-lib 0.10.0 for the periodic authorization model.

### Patch Changes

- Updated dependencies [2ab054a]
- Updated dependencies [1fc1a0e]
  - @naculus/connect-appkit-core@0.11.0
  - @naculus/connect-appkit-react@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [2fcdb09]
- Updated dependencies [88ab081]
  - @naculus/connect-appkit-core@0.10.0
  - @naculus/connect-appkit-react@0.10.0

## 0.9.0

### Minor Changes

- df53f88: Payment UI for React Native, imported from `@naculus/connect-native/ui` (the main entry stays free of UI code): `AuthorizationConsentNative`, `AuthorizationListNative` and `PaymentReceiptNative`, the native counterparts of the web `AuthorizationConsent`, `AuthorizationList` and `PaymentReceipt`. They render the same `@naculus/connect-appkit-core` view models (`describeAuthorization`, `explainSpend`, `formatAuthorizationAmount`, `PaymentRecord`) with plain `react-native` primitives, themed by `NativePaymentTheme` (light and dark palettes from the appkit tokens). Copy actions call the app's `onCopy(text)`; no clipboard dependency is added. `@naculus/connect-appkit-core` is now a peer dependency.

### Patch Changes

- Updated dependencies [df53f88]
  - @naculus/connect-appkit-core@0.9.0
  - @naculus/connect-appkit-react@0.9.0

## 0.8.1

### Patch Changes

- @naculus/connect-appkit-react@0.8.1

## 0.8.0

### Patch Changes

- 5ab74ff: Depend on and accept connect-lib 0.8.0 (`^0.8.0` dependency and peer ranges), which provides the authorization model and settlement verifiers the authorization consent, listing and payment-verification features use.
- Updated dependencies [561b126]
- Updated dependencies [5ab74ff]
  - @naculus/connect-appkit-react@0.8.0

## 0.7.0

### Patch Changes

- Depend on and accept connect-lib 0.7.0 (`^0.7.0` dependency and peer ranges). A `^0.6.0` range does not admit 0.7.0, so 0.6.x ranges would have pulled a second copy of connect-core or failed peer resolution next to connect-lib 0.7.0.
- Updated dependencies
- Updated dependencies [9a3b14d]
- Updated dependencies [36f0aa5]
  - @naculus/connect-appkit-react@0.7.0

## 0.6.0

### Minor Changes

- 1d13406: Requires connect-lib 0.6.0: every connect-lib dependency and peer range moves
  to `^0.6.0` (a `^0.5` range does not admit 0.6.0).

### Patch Changes

- daa8e45: README: load Solana Mobile Wallet Adapter only on Android. The previous
  example imported `@solana-mobile/mobile-wallet-adapter-protocol-kit` at the
  top of `App.tsx`, which throws on iOS at startup (the native module does not
  exist there) and leaves a blank screen. The package itself never imports it.
- Updated dependencies [1d13406]
- Updated dependencies [48c1f45]
- Updated dependencies [7c079ed]
  - @naculus/connect-appkit-react@0.6.0

## 0.5.0

### Minor Changes

- 2520d0f: New package `@naculus/connect-native` for React Native: AsyncStorage
  session persistence, WalletConnect deep links through `Linking`, Solana
  Mobile Wallet Adapter as a Wallet Standard wallet, Coinbase Mobile Wallet
  Protocol as an injected wallet, and a Keystore-sealed embedded wallet
  storage. `Web3ConnectProvider` gains optional `sessionStorage`,
  `walletConnect`, `solanaWallets` and `injectedProviders` config (web
  behavior unchanged). Requires the connect-lib release with the React
  Native hooks.

### Patch Changes

- Updated dependencies [2520d0f]
- Updated dependencies [3e51807]
  - @naculus/connect-appkit-react@0.5.0
