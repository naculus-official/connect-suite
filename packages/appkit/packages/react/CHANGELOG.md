# @naculus/connect-appkit-react

## 0.14.2 — 2026-10-26

- First release from the connect-suite monorepo. Version bump only: connect-lib dependency range moves to `^0.14.2`.

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

- Remove the unused optional dependency on `@naculus/connect-appkit-ui`, so React consumers do not install UI assets automatically. Users who need UI components must explicitly install `@naculus/connect-appkit-ui`.

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

- 48c1f45: `useNotification`: `muteChain` / `unmuteChain` compute the muted list from
  the latest state. Several calls in one tick (mute A, mute B) started from the
  same captured list, so the later call dropped the earlier chain. The Vue
  composable was not affected (its settings ref updates synchronously).
- 7c079ed: `useUserOpStatus` auto-starts tracking whenever `userOpHash` is provided,
  including when it arrives after the first render (the usual case: the hash is
  known only once the operation is sent). It used to check only on mount, so a
  later hash was never tracked. `autoStart: false` still disables it.
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

- a5c0f58: Move the signed off-chain delegation-policy flow into
  `@naculus/connect-appkit-core` (`createDelegationPolicyFlow`,
  `buildDelegationPolicyMessage`, `sameExecutionIntent`, the policy/adapter
  types). The React `useDelegationPolicy` keeps every export and behavior and
  now only wires React state and provider hooks to the shared flow.
- 622a46f: Use shared ERC-20 calldata encoding for transfer, approval, and transfer previews. Transfer simulation now rejects malformed recipients and amounts with excess precision instead of previewing a different transaction than the send path, and hides stale results when inputs become invalid.
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

### Changes

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
- 018855e: **Breaking:** SIWx runs on reconnect, and `validateDestination` no longer
  calls an address "safe".
  
  **`required: true` was enforced once and skipped on every refresh.** Every
  entry point — `connect`, `connectInjected`, `connectEmbedded`,
  `connectPasskeys`, `completePairing` — ran the SIWx flow before reporting
  `connected`. `reconnect` did not, and `autoConnect` defaults to true, so
  reconnect is the path taken on every page load. An application configured with
  the strongest setting got it applied at first connect and bypassed from then
  on: a restored session reported `connected` with no signature produced in that
  session at all.
  
  Reconnect now re-authenticates when SIWx is required. To avoid a prompt on
  every reload, supply `siwx.hasValidSession` — return true from your own
  session check, which is what `useSIWxSession`'s expiry tracking is for. Absent
  means unknown, and unknown re-authenticates: a signature prompt is a nuisance,
  treating an unverified session as signed in is not. A check that throws also
  re-authenticates rather than being read as a yes.
  
  Optional SIWx (`required: false`) is left alone on reconnect. Prompting on
  every reload for something the application said it can live without is the
  wrong trade.
  
  **`AddressValidationLevel` renames `"safe"` to `"ok"`**, and the dialog reads
  "No problem found" instead of "Safe". The function checks four things: that an
  address is non-empty, well formed, and not the zero or a burn address. It
  cannot see an address-poisoning lookalike, a contract that will not release the
  funds, or a known-malicious destination. A green tick reading "Safe" beside a
  scammer's address is worse than no badge at all.
  
  The provider's test double for session storage was three bare spies whose
  `load` returned undefined, so every reconnect in that file took the
  "nothing saved" early return and the whole path was untested. It is now an
  actual store.
- d17e61c: **Breaking:** `useSendTransaction` and `useSendCalls` report `"submitted"`
  where they used to report `"confirmed"`.
  
  Neither hook was in a position to say confirmed. `sendTransaction` resolves
  with a transaction hash, and a hash means the wallet broadcast it — not that it
  was mined, and not that it succeeded. `wallet_sendCalls` is a step further
  away: it answers with a bundle identifier, and EIP-5792 explicitly allows a
  wallet to accept the calls and send them later.
  
  An interface branching on `status === "confirmed"` therefore told a user their
  payment had gone through at the moment the wallet accepted it, while it could
  still revert, be dropped, or never be included.
  
  `useTxMonitor` and `useUserOpStatus` keep `"confirmed"`, because they poll for
  a receipt and it is true there. `getCallsStatus` is what turns a bundle
  identifier into an outcome.
- 5fb7ad2: **Breaking:** `WalletChain` is keyed by CAIP-2, and `useBalance().symbol` can
  be null.
  
  `WalletChain` was `{ id: number; namespace: Namespace; ... }`. A number can
  only ever describe an EIP-155 chain: a Solana reference is base58
  (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) and an XRPL one is an unsigned
  network id. The chain registry structurally could not hold a non-EVM chain, so
  every non-EVM path fell out to "unknown" — and every lookup had to reconstruct
  `` `${namespace}:${id}` `` or pull an integer back out of a CAIP-2 string.
  
  ```diff
  - { id: 137, namespace: "eip155", name: "Polygon", token: "MATIC" }
  + { caip2: "eip155:137", name: "Polygon", token: "MATIC" }
  ```
  
  `namespace` is gone rather than kept alongside: two fields that must agree are
  two fields that eventually do not. Read it with `chainNamespace(chain)`, and
  get the EIP-155 number with `chainNumber(chain)` — which returns null for a
  chain that has none, because there is no number that means "Solana" and any
  stand-in addresses a real EVM chain.
  
  **`useBalance().symbol` is `string | null`.** It was `currentChain?.token ??
  "ETH"`, rendered directly beside the amount. On Polygon that labelled MATIC as
  ether; connected to Solana it labelled SOL as ether. The same fallback is
  removed from `AppKit`'s `balanceSymbol`. Show the amount without a unit rather
  than naming the wrong one.
  
  `useViemClient` and `useTokenBalance` now build no client at all for a non-EVM
  chain instead of passing a fabricated chain number to viem.
  
  Three more hand-rolled CAIP-2 parsers are gone — `useBalance`,
  `useTokenBalance` and `getChainById` each had their own copy of
  `startsWith("eip155:")` plus `parseInt(split(":")[1])`. All of them now go
  through `@naculus/connect-core`.

### Minor Changes

- 1d8b979: `useSendUserOperation` now signs with an embedded wallet, and explains precisely why a passkey cannot.
  
  Both used to receive the same "raw UserOperation signing is not available" refusal, but they are not the same situation. An embedded wallet holds a secp256k1 key and only lacked a primitive that signs a digest rather than text — now provided by `@naculus/connector-embedded`'s `signHash`. A passkey signs with P-256 (COSE alg -7), which a SimpleAccount cannot verify at all; that needs an account implementation with a WebAuthn validator, or the RIP-7212 precompile where it exists. The error now says which case the caller is in, because one is a version bump and the other is a different smart account.
- 1d8b979: `useSendCalls` now asks the wallet what the account can do before assuming it can batch.
  
  Previously the hook called `sendCalls` unconditionally, so a wallet without EIP-5792 support simply failed. It now queries capabilities, and:
  
  - batches when the wallet advertises atomic execution, passing `atomicRequired: true` so the wallet must honour it or reject rather than silently splitting the batch;
  - falls back to sequential `sendTransaction` calls otherwise, including when the wallet cannot be asked at all;
  - exposes `execution` (`"atomic-batch" | "sequential" | null`) so a caller can tell which guarantee it received, and refuses `getCallsStatus` after a sequential send, where the stored handle is a transaction hash rather than a bundle ID.
  
  A sequential send is not atomic: an earlier call can land while a later one fails, and the thrown error now names how many already landed. Callers that require all-or-nothing should check `execution` or query capabilities directly.
  
  `Web3Client` gains an optional `getCapabilities`, and `sendCalls` gains an optional fourth `options` argument. Both are additive.
- 1d8b979: Stop assuming Ethereum mainnet when no chain is known.
  
  Seven call sites resolved a chain as `requested ?? connected ?? "eip155:1"` (or `?? 1`). Each now refuses instead:
  
  - `useSIWxLogin` and `useSignInWithX` fed that value into the `Chain ID:` field of the CAIP-122 message. With no connected chain the user signed an assertion about mainnet regardless of where the wallet actually was. They now throw `invalid_chain`.
  - `Web3ConnectProvider`'s `accountsChanged` handler re-keyed every account to `eip155:1:` CAIP-10 and saved the session, so a session on another chain came back from storage claiming addresses it never had there. It now leaves accounts untouched when the namespace has no EVM chain. The `namespace?.` access before the `if (!namespace) return` guard was also reordered.
  - `useTransactionSimulation`, `useSimulateTransfer`, and `useERC20TransferSimulation` previewed against mainnet, describing a transaction that would not be sent. They now throw rather than simulate on a guessed chain.
  - `useSmartAccount` and `useSendUserOperation` built UserOperations against mainnet's EntryPoint. The chain ID is part of the UserOperation hash, so this was a signed commitment to a chain the user was never shown. Chain resolution moved to a shared `resolveEvmChainId`, which also adds the CAIP-2 validation `useSmartAccount` never had.
  
  Callers that relied on the implicit mainnet default must now pass an explicit `chainId`.
  
  Also replaces `Math.random` with `crypto.getRandomValues` in the seed-phrase backup shuffle and the SIWx session record ID, matching the CSPRNG used everywhere else in the SDK.
- c5ca02f: Add `AccountSelector` and `WalletSecurityPanel`.
  
  `useEmbeddedWallet` already returned the wallet's accounts, but nothing
  rendered them — the capability existed and no user could reach it.
  `AccountSelector` lists every account the wallet holds and lets the user choose
  which one signs.
  
  The EVM row is labelled "Ethereum & EVM" rather than "Ethereum", because that
  one address is the user's account on Polygon, Arbitrum and every other EVM
  chain. Calling it Ethereum would tell someone their Polygon funds live
  somewhere else. Addresses are shown from both ends, never a prefix alone, which
  is all an address-poisoning attack needs to look right.
  
  The derive-missing-accounts affordance appears only when a stored phrase can
  actually produce another account. A wallet imported from a raw private key has
  no phrase and its key is on exactly one curve, so offering it there would
  promise a key that cannot exist.
  
  `WalletSecurityPanel` renders the new storage security report: a score with
  every lost point attached to the sentence explaining it. It says plainly that
  the rubric is this SDK's own rather than an external standard, and it keeps the
  hot-wallet signing exposure visible even though it costs no points — that one
  is the item users most need to read.
  
  `useEmbeddedWallet` gains `securityReport`. The connector builds a fresh object
  per call, so the hook reuses the previous object while the content is
  unchanged; returning a new identity every render would make it unusable as an
  effect dependency. It is null before a wallet exists rather than a fabricated
  worst case, because the storage backend is not chosen until then.
  
  `@naculus/connect-appkit-react` also re-exports `WalletAccount`,
  `WalletNamespace`, `WalletData`, `StorageSecurityReport` and
  `StorageSecurityFinding`, so a UI package can name what the hook returns
  without depending on the connector layer directly.
- 1d8b979: `useEmbeddedWallet` exposes the wallet's accounts, one per namespace.
  
  The engine gained a Solana account alongside the EVM one, but this hook still
  returned a single `address`, so nothing built on appkit could reach it. It now
  returns `accounts`, `activeNamespace`, `setActiveNamespace` and
  `backfillAccounts`.
  
  `setActiveNamespace` publishes a new wallet object rather than relying on the
  mutation the connector performs. Without that React keeps rendering the
  previous address while signing happens on the new account — a mismatch a user
  acts on before anyone notices. It rejects a namespace the wallet holds no
  account for, which is the ordinary case for a wallet imported from a raw key.
  
  `backfillAccounts` derives the accounts a stored phrase produces but an older
  record does not yet hold. Those accounts already exist — the same phrase in
  Phantom shows the balance — so this makes them visible here rather than leaving
  funds reachable everywhere except in this app. It leaves the active namespace
  alone: someone who had an Ethereum wallet yesterday should not find themselves
  on Solana today.
  
  `importFromPrivateKey` widens from `` `0x${string}` `` to `string`, so the
  base58 and JSON forms Phantom and `solana-keygen` export can be pasted in. The
  engine detects which chain the key belongs to and enables only that one.
- c5ca02f: Add the passphrase prompt and passkey registration UI.
  
  Encrypted storage and passkey unlock existed, but nothing could ask the user
  anything: `PocketWallet` takes `encryptionPassphrase` as a callback invoked
  from inside the storage adapter, before React has rendered, so a dialog could
  not be that callback. Every app had to build the bridge itself, which is the
  same as the feature not being there.
  
  `PassphraseGate` is that bridge. The callback resolves a promise a dialog
  fulfils. Set `passphrasePrompt: true` on the client and mount
  `<PassphraseDialog />`; the gate is created, wired in, and exposed as
  `client.passphraseGate`. A callback you supply yourself still wins.
  
  Details that decide whether this works rather than merely runs:
  
  - The passphrase is held for the session. Prompting on every save is how a
    user ends up turning encryption off.
  - Concurrent loads and saves share one prompt instead of stacking two dialogs
    asking the same question.
  - `useEmbeddedWallet` drops the held passphrase when a load fails to decrypt.
    Without that the gate hands the same wrong value to every retry, and the
    user is told their passphrase is wrong while never being asked for a
    different one.
  - The dialog knows whether it is asking for a new passphrase or an existing
    one, and defaults to existing. Showing "choose a passphrase" during an
    unlock invites someone to invent a new one and conclude the wallet is
    broken.
  - Cancelling rejects the operation that asked, rather than resolving with
    something unreadable.
  
  `PasskeySetup` registers a credential and re-seals the stored record under it.
  It reports the outcome honestly instead of as a generic success: PRF cannot be
  added to an existing credential, so a passkey that cannot unlock has to say so
  and say that a new one is needed. "Not checked yet" is shown as its own state
  rather than as failure. It states at the point of enabling that a passkey
  protects the local copy and is not a backup.
  
  When both `enablePasskeys` and encryption are on, `prfUnlock` is wired
  automatically — the platform supporting it is the enable step. Where the
  authenticator cannot answer it returns null and the record stays
  passphrase-only, so wiring it without asking cannot break anything.
  
  There is no strength meter. A color computed from character classes rates
  `P@ssw0rd!` above four ordinary words, which is backwards; the dialog enforces
  the NIST SP 800-63B minimum of 8 and says that length beats symbols.
- 961d3c9: Add a signed, persistent off-chain delegation-policy lifecycle that combines
  session-key scope enforcement, wallet authorization, on-chain delegation reads,
  and execution preview without claiming an EIP-7702/AA broadcast path. Browser
  session keys now use localStorage, embedded wallet state omits recovery secrets,
  restore retries clear stale errors, and sequential call sends normalize real
  transaction hashes from embedded connectors. Policy creation requires a
  host-provided encryption key, and restored policies are cryptographically
  revalidated against their persisted scope, signer, and origin before use. The
  final digest-signing path repeats that verification inside the same locked
  operation that consumes policy budget, preventing a cross-tab policy swap
  between preview and signing.
- 95eae67: Add a fail-closed AA/EIP-7702 policy execution adapter to `useDelegationPolicy`.
  The hook now reports on-chain authorization and sponsorship separately, signs
  only the exact prepared digest after revalidating scope, and refuses broadcast
  when an EIP-7702 delegate does not match the account's live delegation. An
  adapter must also prove that it can submit without invoking the main wallet
  again before the hook reports promptless broadcast readiness.
- 1d8b979: Validate the recipient before a cross-chain route executes, and fix the two name-resolution hooks.
  
  `useExecuteRoute` could not check `recipient` because its own `Quote` type — a local shadow of core's `Route`, which has `toChain` — kept no field describing the destination. An EVM-shaped check would have rejected every legitimate Solana and XRPL address. `Quote` now carries an optional `toChain` (CAIP-2); when present the recipient is validated for that namespace with the same `isValidAddress` the connectors use, and when absent the executor decides as before. An empty recipient is rejected either way, since that is wrong on every chain. A rejection does not consume the concurrency guard.
  
  Note that `Quote` as exported from the package root is `useRouteQuote`'s type, which has entirely different fields (`netReceiveFormatted`, `toTokenSymbol`). A quote from that hook satisfies `useExecuteRoute`'s structurally, so `totalCost` and `estimatedTimeMs` arrive undefined and `toChain` must be supplied by the caller. The two types are now documented rather than silently divergent.
  
  `useResolveName` and `useLookupAddress` were near-identical copies and shared three defects, now fixed once in a common `useNameLookup`:
  
  - No request-generation guard, so typing quickly left two lookups in flight and an earlier one resolving last overwrote the later result — pairing one address with a different address's name, which is what a user reads before deciding where to send.
  - The resolver was captured into a ref on first render and never rebuilt, so changing `resolverConfig` had no effect.
  - The de-duplication guard closed over `data` without listing it as a dependency, testing a value from an earlier render.
  
  Clearing the input now also discards a lookup already in flight, so an abandoned query cannot fill the field back in.
- 1d8b979: Fix `useExecuteRoute` and `useCompareCosts`, both public exports that were entirely untested.
  
  `useExecuteRoute` executes cross-chain transfers:
  
  - It held a `mountedRef` initialized to `true` that nothing ever set to `false`, so every `if (mountedRef.current)` guard was dead code and the hook wrote state after unmount regardless. The unmount effect is now present.
  - There was no concurrency guard, so a double-pressed button submitted the same route twice. It now refuses with `execution_in_progress`, matching `useSendUserOperation`. `reset()` deliberately does not release the guard: a request already handed to the executor is still outstanding.
  - `execute` returned `Promise<void>`, so a caller awaiting it could not tell whether the funds moved — `result` belongs to a later render. It now resolves with the result, or `null` on failure. Existing callers ignoring the value are unaffected.
  - Failing with no executor left the previous run's transaction hash in `result`, which reads as though something was sent. It is now cleared.
  
  `useCompareCosts` decides which route is shown as cheapest:
  
  - `chains` (an array) and `options` (an object) were dependencies by reference, so the natural call site — passing them inline — changed the callback identity every render and re-fired the effect: an unbounded loop against a cost API. Both are now keyed by value, with an order-independent options key that also survives a cyclic object rather than throwing during render.
  - There was no request-generation guard, so a comparison for a chain set the user had moved on from could resolve last and become the displayed answer.
- 1d8b979: `useSendCalls` exposes `showCallsStatus`.
  
  Asks the wallet to display the bundle. It resolves to whether the wallet showed it rather than throwing, because a refusal is cosmetic — the bundle is unaffected — and a caller should not surface a transaction error for something that is not one. It declines for a sequential send, where the stored handle is a transaction hash and there is no bundle to look up.
  
  `Web3Client` gains a matching optional `showCallsStatus`, dispatched to the connector that sent the bundle.
- 1d8b979: Simulation types now come from `@naculus/wallet-engine` instead of being copied.
  
  `useTransactionSimulation` carried its own declarations of `SimulationResult`, `BalanceChange`, `ApprovalChange`, `RiskWarning` and friends — re-exported from the package root, so consumers were given the copy. It was not merely duplicated, it was systematically weakened: every constrained type had been widened to `string` or `number`. Address fields accepted any string, `RiskWarning.category` and `severity` accepted any string so a consumer's `switch` lost its exhaustiveness check, and `tokenDecimals` could not express "unknown" — which leaves a caller no option but to guess a precision.
  
  The types are re-exported from the engine now, so a future divergence is a compile error rather than something found by diffing two files.
  
  Also removes `getNativeSymbol`, which was never called and hardcoded chain ID lists including the sunset Goerli, duplicating the `token` field the chain registry already provides.
- 1d8b979: Fix smart-account lifecycle and UserOperation hooks to derive the connected
  owner, use the active wallet for deployment and raw-hash signing, and reject
  unsafe chain or concurrent-operation states.
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
- 1d8b979: <!-- cspell:ignore appkit -->
  
  Add explicit ERC-7677 paymaster routing to call execution and fail closed when
  an application requires sponsorship but has no app-controlled sponsored
  UserOperation path.
  
  Embedded and passkey sessions now use their own connector when a chain switch
  falls back outside SessionManager, instead of being sent to WalletConnect. The
  chain selector also logs the underlying connector cause when a switch fails.
  An embedded wallet now retains its confirmed storage-security tier after a
  session disconnects instead of being misreported as plaintext localStorage.
- 1d8b979: Wallet-initiated account and chain changes now work for every namespace, not just injected EVM wallets.
  
  `Web3ConnectProvider` used to subscribe by importing `eip6963Connector` directly, calling `getDiscoveredWallets()`, and attaching to the raw EIP-1193 provider — gated on `walletType === "eip6963"`. A Solana or WalletConnect account switch was never noticed, and the provider re-implemented the CAIP-10 re-keying the connector already did.
  
  `Web3Client` gains `onAccountsChanged` and `onChainChanged`, dispatched to the connector carrying the session like every other session-routed call. Both return an unsubscribe function, and both return a no-op rather than undefined when the connector cannot report, so the result is safe to pass straight to a `useEffect` cleanup.
  
  `useERC20Context` now identifies a context by value rather than by object reference. It keyed on `publicClient`, `walletClient`, `session`, and `client` identity; `publicClient` is memoized on `currentChain`, which is memoized on `config.chains`, so a consumer passing an inline `config` object produced a new identity every render — work that was still current reported itself stale, and the callbacks keyed on the identity re-fired their effects. A stale context now throws `session_inactive` rather than `wallet_unavailable`, which pointed at the wrong thing.
- e246d16: `useCapabilities` — ask what the wallet can do before choosing how to execute.
  
  EIP-5792's four methods were all implemented at the connector layer, and
  `useSendCalls` could send a batch, but there was no way for an application to
  run the query the standard exists for: find out whether this wallet batches
  atomically, *then* pick an execution path. The only route was reaching through
  `useWeb3().client.getCapabilities(session)`, which is neither documented nor
  obvious.
  
  ```ts
  const { atomic, current, capabilities } = useCapabilities();
  ```
  
  `atomic` has three values. A wallet that does not implement
  `wallet_getCapabilities` has not said no — it has said nothing, and EIP-5792 is
  explicit that absence is not a denial. Collapsing that to `false` would send
  every silent wallet down the sequential path, which is the one where an approve
  lands and the swap it was for fails. `"unknown"` also covers a query still in
  flight and a query that failed; a stale capability map from a previous wallet
  is a worse answer than no answer, so a failure clears it.
  
  Both wire shapes are read: `atomic: { status }` from 2.0.0, where `"ready"`
  counts as a yes, and the still-deployed `atomicBatch: { supported }` draft.
  Hex chain keys are matched as well as CAIP-2 ones, so a wallet reached through
  a custom connector is not reported as unknown next to an entry that is right
  there.
- 0988380: `useDelegation`, and sponsorship in `useExecuteCalls`.
  
  `useDelegation` reports whether the connected EOA delegates under EIP-7702 and
  to what. `delegated` stays null until the code has been read and when the read
  fails — never false, because that is the answer that misroutes an account which
  can in fact batch.
  
  `useExecuteCalls` takes a `sponsorship` requirement alongside `atomicity`, and
  refuses before sending when sponsored gas was required and the wallet has said
  no paymaster covers it.
  
  Delegation appears in the plan's reason but never changes the route. It is
  evidence about the account, not about the wallet's RPC surface: a delegated EOA
  behind a wallet that does not expose `wallet_sendCalls` still cannot be asked
  to batch. Saying so is the difference between "this cannot work" and "this
  wallet has not wired it up", which is the difference between telling a user to
  give up and telling them to switch wallets.
- 471708d: `useExecuteCalls` — route calls to whatever can honour the requirement, and
  refuse when nothing can.
  
  `useSendCalls` already chooses between an EIP-5792 batch and a sequential
  fallback, but it chooses silently and always sends something. A caller could
  not tell "these landed together" from "the approve landed and the swap did
  not".
  
  ```ts
  const { preview, execute } = useExecuteCalls({
    atomicity: "required",
    userOperation: sendUserOp,   // optional, from useSendUserOperation
  });
  
  preview(2);  // → { route, atomic, reason } — nothing sent
  await execute(calls);
  ```
  
  `preview` is the query EIP-5792 exists for: an application can show "these two
  will land together" or "these will be sent one by one" before the user commits.
  Every plan carries a reason, because an application that refuses to send has to
  tell the user something better than "failed".
  
  Three routes. A wallet batch when the wallet reports it can; a UserOperation
  when it cannot but a smart account is available, since a UserOperation executes
  its calls in one transaction and is atomic by construction; sequential only
  when the caller has said a partial outcome is acceptable. When atomicity is
  required and none of them applies, `execute` throws before sending anything.

### Patch Changes

- 241f958: Prevent UserOperation status polling from confirming stale, mismatched, or malformed bundler receipts. Missing bundler configuration and exhausted HTTP or JSON-RPC failures now reach an explicit terminal error.
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
- 1d8b979: `useSwitchChain` now distinguishes a declined switch from an unsupported chain.
  
  Every failure was collapsed into `chain_unsupported`, so a user pressing Cancel was told the chain was unavailable. EIP-1193 code 4001 now maps to `chain_switch_rejected` and EIP-3326 code 4902 to `chain_unsupported` with a message saying the wallet does not have the chain configured — two outcomes a UI should treat differently, since only one is worth offering to retry.
  
  Mapping lives in a new framework-agnostic `toChainSwitchError`, which also reads a code a wallet sent as a string or nested under `data.originalError`, as WalletConnect does.
- 1d8b979: Normalize both string hashes and embedded-wallet transaction result objects in
  `useSendTransaction`, and fail closed when a connector returns no valid EVM
  transaction hash. Restore a persisted embedded wallet on mount without
  re-exposing its recovery phrase, expose a fail-closed explicit restore action,
  and retry one transient empty IndexedDB read without creating a replacement.
  Prevent circular EIP-6963 provider objects
  from crossing the Web Component JSON boundary by serializing wallet display
  metadata only.
- 95eae67: Wait for the lazily loaded embedded connector before create, import, connect,
  wipe, and account-backfill operations. This prevents cold-start actions from
  failing with `Embedded wallet not enabled` while the enabled connector chunk is
  still loading.
- 1d8b979: Bind ERC-20 allowance, approval, and transfer operations to their token, chain,
  account, spender, and client context. Changing context clears displayed allowance
  and prevents pending reads from restoring stale state. Stale refetches return
  null, and pending decimals lookups or simulations stop before requesting a
  signature after a context change.
  
  Check the token chain before reading approval decimals. Surface allowance RPC
  errors, preserve unknown precision instead of guessing 18 decimals, and use the
  shared amount formatter. The previously added refetchAllowance return value
  remains bigint or null so hasAllowance can use the first awaited result.
- 1d8b979: `useWeb3ErrorHandler`'s `wrapAsync` no longer destroys the error it wraps.
  
  It built a fresh `Error` from the friendly description and threw that, discarding the wallet's own message, any `details`, the stack, and — the part callers notice — the class, so `err instanceof WalletError` stopped matching the moment they adopted the wrapper meant to help them. The friendly title and description are now attached to the original error, which is re-thrown as-is. A code the error already carries is left alone rather than being replaced by one this module inferred from message text; a non-`Error` rejection is still reachable through `cause`.
  
  `useSimulateTransfer` now forwards the RPC URL it computes. `actualRpcUrl` was assigned and never used, so a caller's per-call endpoint did nothing and the simulation ran against whichever URL happened to be baked into the engine's manager on first use.
  
  Both hooks were entirely untested.
- b995e99: Reject SIWx account selection when the requested chain namespace is not present in the active session.
- 1d8b979: Preserve preflight execution guarantees through the actual send. Required
  atomic batches no longer get silently replanned as sequential sends when
  capability discovery is unavailable, sponsorship support is read from the
  wallet response, and a UserOperation fallback cannot bypass a required-gas
  sponsorship refusal.
  
  Capability and EIP-7702 delegation hooks now discard slow responses from a
  wallet or account that disconnected while the request was in flight. Unknown
  EVM chains also remain unlabeled instead of being presented as ETH.
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
- 1d8b979: `useTransactionSimulation` reports simulation coverage.
  
  The hook runs an `eth_call`, so it learns whether a transaction reverts, not what it moves. Its results now carry `coverage` saying so, which keeps a consumer's UI from presenting an empty `balanceChanges` as "no changes".
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
- Updated dependencies [b995e99]
- Updated dependencies [1d8b979]
- Updated dependencies [f1bd4f2]
  - @naculus/connect-appkit-core@1.0.0
  - @naculus/connect-appkit-wc@1.0.0
