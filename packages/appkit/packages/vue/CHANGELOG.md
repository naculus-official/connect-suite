# @naculus/connect-appkit-vue

## 0.15.0 — 2026-10-26

- **Breaking: `useSendWithSession` no longer exposes `signWithSession`** — the composable provides only `checkScope`. Sign transactions with connect-core's `signTransactionWithSessionKey()`.
- **Breaking: `signPolicyDigest` takes the prepared execution** — now `signPolicyDigest(policyId, prepared)` instead of `signPolicyDigest(policyId, digest, tx)`. `PreparedPolicyExecution` gains a required `request: TransactionRequest`; signing refuses a `digest` that does not equal its signing hash; the off-chain policy path compares the target, calldata, value and chain ID of the prepared `request` with the checked transaction (not gas, nonce or fees).
- connect-lib dependency range moves to `^0.15.0`.

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
  - @naculus/connect-appkit-wc@0.13.0

## 0.12.1

### Patch Changes

- Version bump only to keep all appkit packages in lockstep at 0.12.1.

## 0.12.0

### Minor Changes

- Require connect-lib 0.12 (`@naculus/connect` and its packages). Every connect-lib dependency and peer range is now `^0.12.0` (0.12 makes `MppSessionPolicy.mint` required; see the connect-lib 0.12.0 changelog). Install connect-lib 0.12 alongside this release.

### Patch Changes

- 12ae163: Preserve wallet provider messages and error codes when call submission fails.
- Updated dependencies [12ae163]
- Updated dependencies
  - @naculus/connect-appkit-core@0.12.0
  - @naculus/connect-appkit-wc@0.12.0

## 0.11.1

### Patch Changes

- Require connect-lib 0.11. Every `@naculus/*` connect-lib dependency and peer range is now `^0.11.0` (was `^0.10.0`, which in 0.x excludes 0.11.0). With appkit 0.11.0, installing `@naculus/connect-core@0.11.0` next to it left several copies of `@naculus/connect-core` (0.10.0 nested under the connectors, 0.11.0 at the root). connect-lib packages pin each other to one exact version, so appkit cannot span two lib minors: with 0.11.1, a project still on connect-lib 0.10 gets an explicit npm ERESOLVE instead of duplicate copies; upgrade every `@naculus/*` connect-lib package to 0.11. No code change; `@naculus/connect-appkit-wc` is version bump only.
- Updated dependencies
  - @naculus/connect-appkit-core@0.11.1
  - @naculus/connect-appkit-wc@0.11.1

## 0.11.0

### Minor Changes

- 2ab054a: Show periodic authorization limits and whether the blockchain or the current device enforces them across shared descriptions, web components, and React Native components. Require connect-lib 0.10.0 for the periodic authorization model.

### Patch Changes

- Updated dependencies [2ab054a]
- Updated dependencies [1fc1a0e]
  - @naculus/connect-appkit-core@0.11.0
  - @naculus/connect-appkit-wc@0.11.0

## 0.10.0

### Minor Changes

- 2fcdb09: Add `useX402Signer` for React and Vue so a connected external EVM wallet can pay through `createX402Fetch`. `findX402Provider` (appkit-core) picks the provider for a session by its wallet type, shared by both frameworks; the resolver reports why no signer is available and supports injected EIP-6963 sessions plus WalletConnect when its EIP-1193 request facade is available.
  
  Raise every connect-lib dependency and peer range from `^0.8.0` to `^0.9.0`; React and Vue now depend on `@naculus/payments-x402` at `^0.9.0`.

### Patch Changes

- Updated dependencies [2fcdb09]
- Updated dependencies [88ab081]
  - @naculus/connect-appkit-core@0.10.0
  - @naculus/connect-appkit-wc@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [df53f88]
  - @naculus/connect-appkit-core@0.9.0
  - @naculus/connect-appkit-wc@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [8e15e9d]
- Updated dependencies [67ff65c]
  - @naculus/connect-appkit-wc@0.8.1
  - @naculus/connect-appkit-core@0.8.1

## 0.8.0

### Minor Changes

- 561b126: Add authorization consent and spend explanations, authorization listing and
  revocation hooks, and opt-in settlement verification state for paid fetches.

### Patch Changes

- 5ab74ff: Depend on and accept connect-lib 0.8.0 (`^0.8.0` dependency and peer ranges), which provides the authorization model and settlement verifiers the authorization consent, listing and payment-verification features use.
- Updated dependencies [471e86a]
- Updated dependencies [561b126]
- Updated dependencies [5ab74ff]
  - @naculus/connect-appkit-core@0.8.0
  - @naculus/connect-appkit-wc@0.8.0

## 0.7.0

### Minor Changes

- 9a3b14d: Add React and Vue `useMppSession` state shells for caller-built MPP session
  fetches, including metering, channel and receipt state, cooperative and forced
  close actions, and recovery state for a post-send channel-open failure.

### Patch Changes

- Depend on and accept connect-lib 0.7.0 (`^0.7.0` dependency and peer ranges). A `^0.6.0` range does not admit 0.7.0, so 0.6.x ranges would have pulled a second copy of connect-core or failed peer resolution next to connect-lib 0.7.0.
- 36f0aa5: Notification settings changed before the persisted settings finish loading
  are no longer lost: the late load used to overwrite them (a chain muted during
  the first render came back). Such changes are now replayed, in order, on top
  of what was persisted. appkit-core adds `replayNotificationSettings` and the
  `NotificationSettingsUpdate` type, used by both the React hook and the Vue
  composable.
- Updated dependencies
- Updated dependencies [9a3b14d]
- Updated dependencies [36f0aa5]
- Updated dependencies [bf0c026]
- Updated dependencies [5204dcb]
  - @naculus/connect-appkit-core@0.7.0
  - @naculus/connect-appkit-wc@0.7.0

## 0.6.0

### Minor Changes

- 1d13406: Requires connect-lib 0.6.0: every connect-lib dependency and peer range moves
  to `^0.6.0` (a `^0.5` range does not admit 0.6.0).

### Patch Changes

- c59b3d0: `useTxMonitor` (Vue) no longer lets a superseded `refresh()` publish. Only the newest refresh for the current hash, chain and monitor may write `entry`, `error` or `isLoading`; changing those inputs, going idle, or disposing the scope drops any refresh still in flight (the monitor call itself still runs). An older refresh settling no longer turns `isLoading` off while a newer one is pending. Switching hashes clears the previous transaction's `entry` immediately instead of showing it until the new watch resolves, and a refresh that finds no status for the transaction clears `entry` rather than keeping stale data.
- Updated dependencies [0b83786]
- Updated dependencies [1d13406]
  - @naculus/connect-appkit-core@0.6.0
  - @naculus/connect-appkit-wc@0.6.0

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
- 3e51807: Add `useSolanaSessionKey` (React and Vue) and appkit-core
  `createSolanaSessionKeyFlow`: create a Solana session key that the
  connected wallet approves once as the SPL delegate of its token account
  (then pays x402 / MPP Solana charges without a prompt through
  `solana: { sessionKey: { manager, id }, rpc }`), list the owner's keys, and
  revoke one (locally at once, then the wallet's on-chain `Revoke`). A key
  whose approval is declined or cannot be broadcast is revoked locally; if the
  broadcast outcome is unknown the error says so, and `revoke(id)` sends the
  on-chain `Revoke`. Requires the
  connect-lib release that adds `SolanaSessionKeyManager`.

### Patch Changes

- Updated dependencies [2520d0f]
- Updated dependencies [3e51807]
  - @naculus/connect-appkit-core@0.5.0
  - @naculus/connect-appkit-wc@0.5.0

## 0.4.0

### Minor Changes

- 4f99028: EIP-7702 delegation policies. `createDelegationPolicyFlow().createPolicy({ mode: "eip7702", … })` has the connected account — already delegated to MetaMask's EIP7702StatelessDeleGatorImpl — sign a Delegation to the session key (`signTypedData`, `chainId` inputs on `useDelegationPolicy` in React and Vue); connect-core checks the signature and caveats before attaching it. `createDelegationFrameworkAdapter({ manager, rpc, codec })` is the `eip7702` execution adapter: the session key redeems the delegation from its own address and the chain enforces the caveats; transaction encoding comes from the app (`codec`, e.g. viem). An `eip7702` policy signs only its redemptions (`signPolicyDigest` refuses it). Requires connect-lib 0.4.0: every connect-lib peer and dependency range moves to `^0.4.0` (a `^0.3` range does not admit 0.4.0).
- 06582bf: Add `usePaymentFetch` (React and Vue) for agentic payments: pass the paying
  fetch your app built with `createX402Fetch` (`@naculus/payments-x402`) or
  `createMppFetch` (`@naculus/payments-mpp`), and the hook returns `payFetch` and tracks
  `isPending`, `error` and `lastPayment` (every completed payment is recorded). appkit-core adds `describePayment`, which reads
  either protocol's result into one `PaymentRecord` shape. appkit takes no
  dependency on the payments packages; what may be paid stays with them and
  the session key's policy.

### Patch Changes

- 2183249: Invalid and changed inputs now supersede pending requests in `useRouteQuote`,
  `useCompareCosts`, `useTransactionSimulation` and `useSolanaBalance`, so a
  late result or error from an older request can no longer write state. When
  the input no longer permits a request (empty or unquotable route input, no
  chains, no transaction, no Solana address or endpoint, or no quote/compare
  function), the loading flag turns false at once instead of staying true until
  the next request. In `useRouteQuote`, changing to another valid input
  invalidates the running quote immediately rather than when the debounced
  replacement starts: its late quotes or error are dropped and `loading` stays
  true until the replacement settles. Visible errors and the existing
  clearing of quotes, comparisons and balances are unchanged.
- Updated dependencies [4f99028]
- Updated dependencies [06582bf]
  - @naculus/connect-appkit-core@0.4.0
  - @naculus/connect-appkit-wc@0.4.0

## 0.3.0

### Minor Changes

- Require connect-lib 0.3.0. The `@naculus/connect-core` peer ranges of appkit-core and appkit-ui move from `^0.2.x` to `^0.3.0` (a `^0.2` range does not admit 0.3.0), and the React and Vue dependencies on connect-lib packages follow. No appkit API change: this release keeps the two SDKs in lockstep. connect-lib 0.3.0 is breaking only for apps that use `@naculus/wallet-engine` session keys directly — see its CHANGELOG.

### Patch Changes

- Updated dependencies
  - @naculus/connect-appkit-core@0.3.0
  - @naculus/connect-appkit-wc@0.3.0

## 0.2.8

### Patch Changes

- Require connect-lib 0.2.8, which binds session-key recipient limits to what is signed. `createDelegationPolicyFlow().createPolicy` now refuses a scope with `allowedRecipients`: this flow's executions sign raw digests, which connect-core 0.2.8 refuses while recipients are limited, so such a policy could be created and previewed as valid yet never sign.
- Updated dependencies
  - @naculus/connect-appkit-core@0.2.8
  - @naculus/connect-appkit-wc@0.2.8

## 0.2.7

### Patch Changes

- 2250cd2: Consume connect-lib 0.2.6's CAIP-25 session lifecycle: `useSession` (React
  and Vue) and the React provider react to `sessionScopeChanged` and
  `sessionRevoked`, so a wallet narrowing or ending a session updates app state
  on every connector, not only WalletConnect. `isBurnDestination` now delegates
  to connect-core's unified `isBurnAddress`. Peer minimum for `@naculus/*` is
  `^0.2.6`.
- ee26569: Add `useDelegate` (React and Vue): the EIP-7702 owner path for the embedded
  wallet — `delegate(address)` sends a type-4 transaction delegating the
  connected account to an allowlisted implementation, `revoke()` clears it.
  Thin shells over connect-core's `delegateAccount`; the allowlist is required
  and empty by default, and other wallets fail with `method_unsupported`.
  Requires `@naculus/connect-core` 0.2.7 (peer minimum raised with that
  release).
- Updated dependencies [2250cd2]
  - @naculus/connect-appkit-core@0.2.7
  - @naculus/connect-appkit-wc@0.2.7

## 0.2.6

### Patch Changes

- 531cbc2: Fail closed in three places found in review. `sameExecutionIntent` no longer
  treats a field the caller omitted as a wildcard, so an execution adapter
  cannot add a target, calldata, value or chain to what the session key signs.
  Vue `useSmartAccount` writes address and deployment state only if the
  account, chain and manager that started the operation are still current.
  `useSendUserOperation` (React and Vue) keeps its single-flight lock across
  `reset()` until the in-flight UserOperation settles, so a reset cannot start
  a second on-chain submission alongside the first.
- ce39294: Add Vue `useSmartAccount`, `useSendUserOperation` and `useUserOpStatus` over
  connect-core's `SmartAccountManager` and the shared appkit-core decisions.
  Deployment goes through the caller's transaction sender and the
  UserOperation signer is caller-supplied.
- 6cef78b: Add Vue `useDelegationPolicy` over appkit-core's shared delegation-policy
  flow, with caller-supplied signer, signature verifier, execution planner and
  delegation state.
- 3084748: Add Vue `useExecuteCalls` and `useSendCalls` composables around caller-owned EIP-5792 actions and policy state.
- 9b982bc: Add a Vue `useEmbeddedWallet` composable around caller-owned wallet state and actions.
- bf47ae4: Add Vue ERC-20 transfer, approval, and transfer simulation composables backed by the shared strict calldata encoders. Wallet reads and sends remain caller-owned, chain mismatches fail closed, and invalid transfer inputs cannot display a stale simulation result.
- 5129ba5: Add Vue `useSessionKeys`, `useCreateSessionKey`, `useRevokeSession` and
  `useSendWithSession` over connect-core's `SessionKeyManager`, sharing the
  process-wide instance and config guard with React or taking a caller-owned
  manager.
- a39097c: Add a Vue `useSignInWithEthereum` composable around a caller-owned SIWX sign-in action.
- e90d340: Add Vue composables for message signing, EVM transaction sending, and Solana transaction signing, sending, and status reads. Each composable wraps caller-owned actions without changing message or transaction payloads.
- a8ebb69: Share simulation chain and RPC decisions between React and Vue, and add Vue `useSimulateTransfer` and `useTransactionSimulation` composables. Simulation remains a basic revert check with no asset-change or risk coverage. Simulation now rejects a chain override that would reuse another chain's RPC or client; pass a matching RPC URL when overriding the chain.
- ff3f4c1: Add Vue SIWX login and session composables around caller-owned signing, persistence, and temporal-policy state.
- Updated dependencies [a5c0f58]
- Updated dependencies [11a4fd8]
- Updated dependencies [531cbc2]
- Updated dependencies [ef9ac4f]
- Updated dependencies [1c42c23]
- Updated dependencies [1ba2f9b]
- Updated dependencies [88f72c9]
- Updated dependencies [36f2ccc]
- Updated dependencies [a8ebb69]
  - @naculus/connect-appkit-core@0.2.6
  - @naculus/connect-appkit-wc@0.2.6

## 0.2.5

### Patch Changes

- 890f38d: Expose Vue account and Solana account composables with connected-state semantics matching the React hooks.
- 8ce3204: Move destination-address validation and the CAIP-10 → bare address split into
  `@naculus/connect-appkit-core` (`validateDestination`, `isBurnDestination`,
  `bareEvmAddress`). The React `validateDestination` / `useValidateDestination`
  keep their public shape and strings and now delegate to it; the Vue balance and
  delegation composables use the shared split instead of local copies.
- 2d93f50: Add Vue composables for transaction monitoring, transaction history, and the
  most recent terminal transaction. They take a caller-owned monitor and mirror
  the React lifecycle without introducing a Vue provider.
- ca530e7: Add Vue `useBalance` and `useTokenBalance` composables that read native and
  ERC-20 balances through a caller-owned client, with optional auto-refresh.
- 327eb9e: Add Vue connection and disconnection lifecycle composables.
- e90097c: Add a read-only Vue EIP-7702 delegation status composable.
- b0874b0: Add reactive Vue name and reverse-address lookup composables with stale-result protection.
- e4b85d9: Move notification settings persistence and in-app notification actions into
  framework-neutral AppKit core while preserving the React hook behavior, and
  expose the corresponding Vue `useNotification` composable.
- b30a35a: Add Vue `useRouteQuote`, `useCompareCosts` and `useExecuteRoute` composables
  over the shared routing core.
- 830edc9: Add a reactive Vue useSession composable for active wallet and chain sessions.
- 5a70723: Add a Vue chain-switch lifecycle composable with provider error classification.
- 1fff014: Add Vue `useTokenList` and `useTokenSearch` composables over connect-core's
  `TokenListManager`, with CAIP-2 chain filtering and debounced search.
- 2790e75: Add Vue `useValidateDestination`, returning the shared core's verdict with a
  machine-readable `issue` for the caller to localize.
- Updated dependencies [8ce3204]
- Updated dependencies [46e710d]
- Updated dependencies [4b0024a]
- Updated dependencies [e4b85d9]
  - @naculus/connect-appkit-core@0.2.5
  - @naculus/connect-appkit-wc@0.2.5

## 0.2.4

### Patch Changes

- f012e61: Expose Solana signer roles. `useSolanaRoles` (React hook and Vue composable)
  wraps `@naculus/connector-solana`'s `getRoles`, splitting the connected
  account into `identity`, `signer` and `payer`, each `null` when the wallet
  declared it cannot fill that role — so a co-signing or relayer-submitted flow
  finds out before it opens a dialog that cannot succeed.
  
  The reasoning lives once, in `@naculus/connect-appkit-core` as
  `readSolanaRoles`, and adds the part a UI has to decide before it can show
  anything: `absence` is `no_session`, `not_solana` or `unreported`, so a
  connector that predates the roles API (`@naculus/connector-solana` < 0.2.4)
  reads as "has not said" rather than "cannot sign".
- 9cd817d: Correct the published component count from 24 to 28. `packages/wc/src` defines
  28 `@Component` tags and both the React and Vue wrappers generate 28 proxies,
  so the number in the READMEs and in the `wc` package description — which npm
  and market analyses read — was three releases stale.
- Updated dependencies [f012e61]
- Updated dependencies [9cd817d]
  - @naculus/connect-appkit-core@0.2.4
  - @naculus/connect-appkit-wc@0.2.4

## 0.2.2

> These entries were written as changesets during 0.2.0 and 0.2.1 but never
> consumed at those releases, so they accumulated. They describe work shipped
> across 0.2.0, 0.2.1 and 0.2.2 rather than 0.2.2 alone, and are collected here
> because deleting them would have thrown away the only written record of what
> those releases contained.

### Minor Changes

- b995e99: New package: `@naculus/connect-appkit-core`, the half of appkit that is not
  about React.
  
  appkit's stated shape is "write the Stencil components once, generate the
  React and Vue wrappers". That works for anything visual and never covered the
  logic: the React package carried roughly 8,500 hand-written lines against
  Vue's 280, and only two files in it contain JSX. The rest was logic wearing
  React clothes, reachable from exactly one framework — so a Vue application got
  components and no way to use them.
  
  Moved, unchanged: the connection state machine, chain resolution, token chain
  and decimals handling, provider error mapping, revert-reason decoding, the
  name resolver, and the types they are built on. Every one of them already
  imported no framework; they were simply in a package that did.
  
  `@naculus/connect-appkit-react` re-exports all of it, so a React consumer sees
  no change. **Breaking only for a consumer importing from a deep path** such as
  `@naculus/connect-appkit-react/dist/core/...`.
  
  `WalletChain`, `ChainInfo`, `ConnectionStatus` and `Web3State` are now defined
  once, in the new package, and re-exported by React rather than declared twice.
  Two structurally identical declarations typecheck fine and drift on the first
  edit.
  
  Vue gains `useChain`, which was not previously possible: `currentChain`,
  `chainInfo`, `availableChains`, `currentChainNumber` and `namespace`. The file
  contains no decision of its own — filtering the switcher to the connected
  namespace, describing non-EVM chains, and refusing to invent a chain number
  for Solana are all properties of the shared core, so both bindings get them or
  neither does.
- aec3be4: Stop offering chains a connected wallet cannot switch to.
  
  `useChain().availableChains` returned every configured chain regardless of
  what was connected. A Solana wallet was shown Ethereum and Polygon in the
  switcher, and clicking one asked a wallet with no concept of EIP-155 to switch
  to chain 137 — an action the interface presented as available and that could
  never work. It now filters to the connected namespace, and offers everything
  only when nothing is connected yet, since nothing has been ruled out then.
  
  `chainInfo` returned null for any namespace other than EIP-155, so a connected
  Solana wallet had no chain to display and the interface fell back to "Unknown
  Chain". It now describes every namespace, and names an unconfigured chain by
  its CAIP-2 reference rather than inventing "Chain 5" for a Solana cluster.
  
  `getChainById` and `useChain` both stop parsing CAIP-2 by hand and use
  `@naculus/connect-core`.
  
  `useAccount` reads each account's namespace from its CAIP-10 form instead of
  guessing from address shape, and falls back to shape only for a bare address —
  a bare `0x`-40-hex value is unambiguously EVM, a bare base58 string is not
  unambiguously anything.
  
  Vue gains `useAccounts`, applying the same rules from the same core functions.
  The two bindings differ in `computed` versus `useMemo` and nothing else.
- 388674e: Solana reaches the application layer.
  
  The engine could hold a Solana account, sign with it and send a transaction,
  but appkit had no Solana hook of any kind — an application could not read a
  balance or submit anything.
  
  `useSolanaAccount` reads the connected Solana account off the session's
  namespaces, so an injected wallet and the embedded wallet answer the same way.
  It matches on the `solana:` namespace and never on address shape, because base58
  is not distinguishable by inspection and guessing would eventually call
  something a Solana address that is not one.
  
  `useSolanaBalance` leaves `balance` null until a read succeeds, and clears it
  when one fails. A zero placeholder is a number a user reads as their balance,
  and a stale figure beside an error is worse. `isConfigured` reports a missing
  RPC endpoint as its own fact — the only one a caller can act on.
  
  `useSolanaTransaction` signs and sends through whichever wallet is connected.
  
  Two gaps in the client that this exposed:
  
  - `sendTransaction` typed its input as `Record<string, unknown>`, which is an
    EVM transaction's shape. A Solana transaction is bytes the application has
    already serialized, so it could not be expressed at all even once the
    connector below knew how to handle it.
  - There was no `signTransaction` on the client. A Solana application routinely
    signs a transaction it submits itself or hands to a relayer, and there was no
    way to ask for that.
  
  The Vue package gains `useSolanaBalance` too. Everything that took thought
  lives in `@naculus/connect-core`; what does not translate between the two
  frameworks is only the reactivity.
- c5ca02f: A Vue binding for the passphrase gate, and stories for the wallet components.
  
  `usePassphraseGate` is now available as a Vue composable. The gate itself moved
  to `@naculus/connect-core`, because the problem it solves — an encrypted
  storage adapter asking for a passphrase from inside code that has never heard
  of a component — is the same in both frameworks and deserved one
  implementation rather than two.
  
  `AccountSelector`, `WalletSecurityPanel`, `PassphraseDialog` and `PasskeySetup`
  each gained a presentational `*View` export, with the existing component a thin
  wrapper that supplies the data. Every interesting state in these — a passkey
  that cannot unlock, a record awaiting re-seal, a retry after a failed decrypt,
  a wallet imported from a raw key — is otherwise reachable only by arranging a
  real authenticator or a real failure. The views are exported because Storybook
  is a second consumer and so is any application holding its own state.
  
  `.storybook/main.ts` only globbed `packages/wc`, so the three story files in
  `packages/ui` had never been loaded by Storybook at all. They are now, along
  with 22 new stories.
  
  The embedded connector reports account changes, so `client.onAccountsChanged`
  now routes `embedded` to it instead of returning a no-op.

### Patch Changes

- Updated dependencies [b995e99]
- Updated dependencies [1d8b979]
- Updated dependencies [f1bd4f2]
  - @naculus/connect-appkit-core@1.0.0
  - @naculus/connect-appkit-wc@1.0.0
