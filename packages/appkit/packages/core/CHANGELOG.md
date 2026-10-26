# @naculus/connect-appkit-core

## 0.15.0 — 2026-10-26

- **Breaking: `signPolicyDigest` takes the prepared execution** — now `signPolicyDigest(policyId, prepared)` instead of `signPolicyDigest(policyId, digest, tx)`. `PreparedPolicyExecution` gains a required `request: TransactionRequest`; signing refuses a `digest` that does not equal its signing hash; the off-chain policy path compares the target, calldata, value and chain ID of the prepared `request` with the checked transaction (not gas, nonce or fees).
- Off-chain policy signing runs through connect-core's `signTransactionWithVerifiedOffchainAuthorization`.
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

## 0.12.1

### Patch Changes

- Version bump only to keep all appkit packages in lockstep at 0.12.1.

## 0.12.0

### Minor Changes

- Require connect-lib 0.12 (`@naculus/connect` and its packages). Every connect-lib dependency and peer range is now `^0.12.0` (0.12 makes `MppSessionPolicy.mint` required; see the connect-lib 0.12.0 changelog). Install connect-lib 0.12 alongside this release.

### Patch Changes

- 12ae163: Preserve wallet provider messages and error codes when call submission fails.

## 0.11.1

### Patch Changes

- Require connect-lib 0.11. Every `@naculus/*` connect-lib dependency and peer range is now `^0.11.0` (was `^0.10.0`, which in 0.x excludes 0.11.0). With appkit 0.11.0, installing `@naculus/connect-core@0.11.0` next to it left several copies of `@naculus/connect-core` (0.10.0 nested under the connectors, 0.11.0 at the root). connect-lib packages pin each other to one exact version, so appkit cannot span two lib minors: with 0.11.1, a project still on connect-lib 0.10 gets an explicit npm ERESOLVE instead of duplicate copies; upgrade every `@naculus/*` connect-lib package to 0.11. No code change; `@naculus/connect-appkit-wc` is version bump only.

## 0.11.0

### Minor Changes

- 2ab054a: Show periodic authorization limits and whether the blockchain or the current device enforces them across shared descriptions, web components, and React Native components. Require connect-lib 0.10.0 for the periodic authorization model.

### Patch Changes

- 1fc1a0e: Describe grant periods that are whole minutes in minutes: a 1800-second period reads "every 30 minutes" instead of "every 1800 seconds". Periods that are not a whole number of minutes stay in seconds, and weeks, days, and hours read as before.

## 0.10.0

### Minor Changes

- 2fcdb09: Add `useX402Signer` for React and Vue so a connected external EVM wallet can pay through `createX402Fetch`. `findX402Provider` (appkit-core) picks the provider for a session by its wallet type, shared by both frameworks; the resolver reports why no signer is available and supports injected EIP-6963 sessions plus WalletConnect when its EIP-1193 request facade is available.
  
  Raise every connect-lib dependency and peer range from `^0.8.0` to `^0.9.0`; React and Vue now depend on `@naculus/payments-x402` at `^0.9.0`.
- 88ab081: Trusted assets: `describeAuthorization` and `explainSpend` accept `trustedAssets` (CAIP-19 IDs; EVM token addresses compared case-insensitively). Each grant reports `assetTrust` (`trusted`, `unverified`, or `unchecked` when no list is given, which keeps the previous output). An unverified asset never shows caller-supplied metadata: its label is the token address and amounts are in base units, so a token that merely calls itself "USDC" cannot read as USDC. The web and React Native consent and listing components take `trustedAssets` and show "Unverified token — not on the trusted list".
  
  Amounts are grouped without `toLocaleString`, so React Native (Hermes, which ignores the locale for BigInt) shows "2,000,000" like the web does.

## 0.9.0

### Patch Changes

- df53f88: `describeAuthorization` no longer crashes on React Native: Hermes ships no `Intl.RelativeTimeFormat`, so the relative expiry ("in 3 days", "2 hours ago") now falls back to the English form instead of throwing `undefined cannot be used as a constructor`.

## 0.8.1

No changes in this release.

## 0.8.0

### Minor Changes

- 561b126: Add authorization consent and spend explanations, authorization listing and
  revocation hooks, and opt-in settlement verification state for paid fetches.

### Patch Changes

- 471e86a: Add authorization consent and management views plus verification-honest payment receipts, and format authorization expiry in useful time units.
- 5ab74ff: Depend on and accept connect-lib 0.8.0 (`^0.8.0` dependency and peer ranges), which provides the authorization model and settlement verifiers the authorization consent, listing and payment-verification features use.

## 0.7.0

### Minor Changes

- 9a3b14d: Add React and Vue `useMppSession` state shells for caller-built MPP session
  fetches, including metering, channel and receipt state, cooperative and forced
  close actions, and recovery state for a post-send channel-open failure.
- 36f0aa5: Notification settings changed before the persisted settings finish loading
  are no longer lost: the late load used to overwrite them (a chain muted during
  the first render came back). Such changes are now replayed, in order, on top
  of what was persisted. appkit-core adds `replayNotificationSettings` and the
  `NotificationSettingsUpdate` type, used by both the React hook and the Vue
  composable.

### Patch Changes

- Depend on and accept connect-lib 0.7.0 (`^0.7.0` dependency and peer ranges). A `^0.6.0` range does not admit 0.7.0, so 0.6.x ranges would have pulled a second copy of connect-core or failed peer resolution next to connect-lib 0.7.0.

## 0.6.0

### Minor Changes

- 1d13406: Requires connect-lib 0.6.0: every connect-lib dependency and peer range moves
  to `^0.6.0` (a `^0.5` range does not admit 0.6.0).

### Patch Changes

- 0b83786: `normalizeEip155ChainId` refuses chain 0 and chain IDs above
  `Number.MAX_SAFE_INTEGER`; it accepted `0x0` / `eip155:0` before, which is not
  an EIP-155 chain. Matches connect-core's reader of the same name.

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

## 0.3.0

### Minor Changes

- Require connect-lib 0.3.0. The `@naculus/connect-core` peer ranges of appkit-core and appkit-ui move from `^0.2.x` to `^0.3.0` (a `^0.2` range does not admit 0.3.0), and the React and Vue dependencies on connect-lib packages follow. No appkit API change: this release keeps the two SDKs in lockstep. connect-lib 0.3.0 is breaking only for apps that use `@naculus/wallet-engine` session keys directly — see its CHANGELOG.

## 0.2.8

### Patch Changes

- Require connect-lib 0.2.8, which binds session-key recipient limits to what is signed. `createDelegationPolicyFlow().createPolicy` now refuses a scope with `allowedRecipients`: this flow's executions sign raw digests, which connect-core 0.2.8 refuses while recipients are limited, so such a policy could be created and previewed as valid yet never sign.

## 0.2.7

### Patch Changes

- 2250cd2: Consume connect-lib 0.2.6's CAIP-25 session lifecycle: `useSession` (React
  and Vue) and the React provider react to `sessionScopeChanged` and
  `sessionRevoked`, so a wallet narrowing or ending a session updates app state
  on every connector, not only WalletConnect. `isBurnDestination` now delegates
  to connect-core's unified `isBurnAddress`. Peer minimum for `@naculus/*` is
  `^0.2.6`.

## 0.2.6

### Patch Changes

- a5c0f58: Move the signed off-chain delegation-policy flow into
  `@naculus/connect-appkit-core` (`createDelegationPolicyFlow`,
  `buildDelegationPolicyMessage`, `sameExecutionIntent`, the policy/adapter
  types). The React `useDelegationPolicy` keeps every export and behavior and
  now only wires React state and provider hooks to the shared flow.
- 11a4fd8: Expose strict ERC-20 transfer, approve, and transferFrom calldata encoders for shared React/Vue use. Encoding rejects invalid EVM address casing and out-of-range uint256 amounts.
- 531cbc2: Fail closed in three places found in review. `sameExecutionIntent` no longer
  treats a field the caller omitted as a wildcard, so an execution adapter
  cannot add a target, calldata, value or chain to what the session key signs.
  Vue `useSmartAccount` writes address and deployment state only if the
  account, chain and manager that started the operation are still current.
  `useSendUserOperation` (React and Vue) keeps its single-flight lock across
  `reset()` until the in-flight UserOperation settles, so a reset cannot start
  a second on-chain submission alongside the first.
- ef9ac4f: Move the process-wide `SessionKeyManager` registry and its spending-config
  guard into `@naculus/connect-appkit-core` (`getSharedSessionKeyManager`,
  `resetSharedSessionKeyManager`, `sessionKeyConfigFingerprint`). The React
  session-key hooks keep their exports and delegate to it.
- 1c42c23: Fail closed when persisted SIWX authentication contains malformed `expirationTime` or `notBefore` claims instead of treating it as currently valid.
- 1ba2f9b: Centralize SIWX browser defaults, temporal validity checks, and result-to-session mapping in appkit-core while preserving React behavior.
- 88f72c9: Move the smart-account decisions shared by React and Vue into
  `@naculus/connect-appkit-core`: `resolveUserOpChain` (fail-closed chain
  selection and mismatch check), `buildSmartAccountConfig` and
  `assertHexSignature`. React `useSmartAccount` / `useSendUserOperation`
  delegate to them and use the shared `bareEvmAddress`.
- 36f2ccc: Move ERC-4337 receipt validation and the `eth_getUserOperationReceipt` call
  into `@naculus/connect-appkit-core` (`parseUserOperationReceipt`,
  `fetchUserOperationReceipt`, `InvalidUserOperationReceiptError`). React
  `useUserOpStatus` keeps its behavior and delegates to them.
- a8ebb69: Share simulation chain and RPC decisions between React and Vue, and add Vue `useSimulateTransfer` and `useTransactionSimulation` composables. Simulation remains a basic revert check with no asset-change or risk coverage. Simulation now rejects a chain override that would reuse another chain's RPC or client; pass a matching RPC URL when overriding the chain.

## 0.2.5

### Patch Changes

- 8ce3204: Move destination-address validation and the CAIP-10 → bare address split into
  `@naculus/connect-appkit-core` (`validateDestination`, `isBurnDestination`,
  `bareEvmAddress`). The React `validateDestination` / `useValidateDestination`
  keep their public shape and strings and now delegate to it; the Vue balance and
  delegation composables use the shared split instead of local copies.
- 4b0024a: Move the chain-abstraction (routing) domain types and decisions into
  `@naculus/connect-appkit-core`: `RouteQuote`, `CostComparison`,
  `ExecutableQuote` and friends, plus `isQuotableInput`, `compareCostsKey`,
  `validateRouteRecipient` and `toExecuteRouteError`. The React `useRouteQuote`,
  `useCompareCosts` and `useExecuteRoute` keep their exported names and behavior
  and delegate to them.
- e4b85d9: Move notification settings persistence and in-app notification actions into
  framework-neutral AppKit core while preserving the React hook behavior, and
  expose the corresponding Vue `useNotification` composable.

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
- f1bd4f2: Finish removing the fabricated currency symbol, and stop building the viem
  chain three times.
  
  Making `useBalance().symbol` nullable was undone one layer down:
  `AccountButton` rendered `balanceSymbol ?? "ETH"` and `ConnectButtonAdapter`
  passed the same fallback into the web component. Those are the two places a
  user actually reads it, so the label said "ETH" beside a MATIC or SOL amount
  regardless. Both now render no unit rather than the wrong one.
  
  `toViemChain` replaces three identical inline blocks in `useBalance`,
  `useTokenBalance` and `useViemClient` — three copies of the same `?? "ETH"`,
  which is three places for it to be wrong. The native symbol now comes from the
  chain's own `token`, then the shared chain registry, and only then a fallback
  that is reached solely for an EVM chain nobody has a record of. viem requires
  a string there and does not render it; the symbol a user reads stays null when
  unknown.
  
  The extraction introduced a render loop on the way — a freshly built chain
  object every render changed the memo key of the client effects, which never
  settled. It is memoised, and a test now pins the clients holding still across
  renders.

### Patch Changes

- 1d8b979: Preserve preflight execution guarantees through the actual send. Required
  atomic batches no longer get silently replanned as sequential sends when
  capability discovery is unavailable, sponsorship support is read from the
  wallet response, and a UserOperation fallback cannot bypass a required-gas
  sponsorship refusal.
  
  Capability and EIP-7702 delegation hooks now discard slow responses from a
  wallet or account that disconnected while the request was in flight. Unknown
  EVM chains also remain unlabeled instead of being presented as ETH.
