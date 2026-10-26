# @naculus/connect-appkit-ui

## 0.15.0 — 2026-10-26

- Version bump only: connect-lib dependency range moves to `^0.15.0`.

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

- Update `lucide-react` to `^1.52.0`.

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

### Patch Changes

- Updated dependencies [df53f88]
  - @naculus/connect-appkit-core@0.9.0
  - @naculus/connect-appkit-react@0.9.0

## 0.8.1

### Patch Changes

- 67ff65c: Keep dialogs and payment authorization actions reachable in short, zoomed, and
  foldable viewports, and enlarge compact copy and reveal controls' touch areas.
  
  appkit-button never grows wider than its container, and the connected wallet badge truncates a long balance with an ellipsis instead of overflowing on very narrow screens (e.g. a 280 px foldable cover screen).
- @naculus/connect-appkit-react@0.8.1
  - @naculus/connect-appkit-core@0.8.1

## 0.8.0

### Minor Changes

- 471e86a: Add authorization consent and management views plus verification-honest payment receipts, and format authorization expiry in useful time units.

### Patch Changes

- 5ab74ff: Depend on and accept connect-lib 0.8.0 (`^0.8.0` dependency and peer ranges), which provides the authorization model and settlement verifiers the authorization consent, listing and payment-verification features use.
- Updated dependencies [471e86a]
- Updated dependencies [561b126]
- Updated dependencies [5ab74ff]
  - @naculus/connect-appkit-core@0.8.0
  - @naculus/connect-appkit-react@0.8.0

## 0.7.0

### Minor Changes

- 5a4b17f: The React components now ship their styles. `import "@naculus/connect-appkit-ui/styles"` loads tokens, the small reset and the compiled component utilities; no Tailwind setup is needed in the app. The component CSS writes values into each class and defines no `:root` variables, so it does not override an app's own Tailwind theme. Apps without a page reset of their own can also import the opt-in `@naculus/connect-appkit-ui/styles/preflight`. Components that read a base control from the registry (AccountButton, ChainSelector, ErrorBoundary, RouteSelector, SeedPhraseBackup, SignInButton, SmartWalletSettings, SmartWalletToggle) fall back to a native control instead of crashing when none is registered.

### Patch Changes

- Depend on and accept connect-lib 0.7.0 (`^0.7.0` dependency and peer ranges). A `^0.6.0` range does not admit 0.7.0, so 0.6.x ranges would have pulled a second copy of connect-core or failed peer resolution next to connect-lib 0.7.0.
- Updated dependencies
- Updated dependencies [9a3b14d]
- Updated dependencies [36f0aa5]
  - @naculus/connect-appkit-core@0.7.0
  - @naculus/connect-appkit-react@0.7.0

## 0.6.0

### Minor Changes

- 1d13406: Requires connect-lib 0.6.0: every connect-lib dependency and peer range moves
  to `^0.6.0` (a `^0.5` range does not admit 0.6.0).

### Patch Changes

- 81c339b: Nine dependencies consumers installed for nothing are gone: seven
  `@radix-ui/*` packages and `class-variance-authority` were imported nowhere,
  and `qrcode` is bundled into the package (it is now a dev dependency). No
  behavior change.
- 2f8ccd2: Decorative icons in the UI and Web Components (chevrons, checks, chain marks)
  carry `aria-hidden`, so screen readers skip them.
- 3d5e39f: `ThemeProvider` drops theme values containing `;`, `{`, `}`, `<`, `>`, a
  backslash or a line break instead of writing them into its `<style>` element,
  and renders that element's text as a child rather than through
  `dangerouslySetInnerHTML`. A theme taken from outside the app (a URL parameter,
  a stored preference) could otherwise inject arbitrary CSS.
- Updated dependencies [0b83786]
- Updated dependencies [1d13406]
- Updated dependencies [48c1f45]
- Updated dependencies [7c079ed]
  - @naculus/connect-appkit-core@0.6.0
  - @naculus/connect-appkit-react@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [2520d0f]
- Updated dependencies [3e51807]
  - @naculus/connect-appkit-react@0.5.0
  - @naculus/connect-appkit-core@0.5.0

## 0.4.0

### Minor Changes

- 4f99028: EIP-7702 delegation policies. `createDelegationPolicyFlow().createPolicy({ mode: "eip7702", … })` has the connected account — already delegated to MetaMask's EIP7702StatelessDeleGatorImpl — sign a Delegation to the session key (`signTypedData`, `chainId` inputs on `useDelegationPolicy` in React and Vue); connect-core checks the signature and caveats before attaching it. `createDelegationFrameworkAdapter({ manager, rpc, codec })` is the `eip7702` execution adapter: the session key redeems the delegation from its own address and the chain enforces the caveats; transaction encoding comes from the app (`codec`, e.g. viem). An `eip7702` policy signs only its redemptions (`signPolicyDigest` refuses it). Requires connect-lib 0.4.0: every connect-lib peer and dependency range moves to `^0.4.0` (a `^0.3` range does not admit 0.4.0).

### Patch Changes

- Updated dependencies [4f99028]
- Updated dependencies [06582bf]
  - @naculus/connect-appkit-core@0.4.0
  - @naculus/connect-appkit-react@0.4.0

## 0.3.0

### Minor Changes

- Require connect-lib 0.3.0. The `@naculus/connect-core` peer ranges of appkit-core and appkit-ui move from `^0.2.x` to `^0.3.0` (a `^0.2` range does not admit 0.3.0), and the React and Vue dependencies on connect-lib packages follow. No appkit API change: this release keeps the two SDKs in lockstep. connect-lib 0.3.0 is breaking only for apps that use `@naculus/wallet-engine` session keys directly — see its CHANGELOG.

### Patch Changes

- Updated dependencies
  - @naculus/connect-appkit-core@0.3.0
  - @naculus/connect-appkit-react@0.3.0

## 0.2.8

### Patch Changes

- Require connect-lib 0.2.8, which binds session-key recipient limits to what is signed. `createDelegationPolicyFlow().createPolicy` now refuses a scope with `allowedRecipients`: this flow's executions sign raw digests, which connect-core 0.2.8 refuses while recipients are limited, so such a policy could be created and previewed as valid yet never sign.
- Updated dependencies
  - @naculus/connect-appkit-core@0.2.8
  - @naculus/connect-appkit-react@0.2.8

## 0.2.7

### Patch Changes

- 2250cd2: Consume connect-lib 0.2.6's CAIP-25 session lifecycle: `useSession` (React
  and Vue) and the React provider react to `sessionScopeChanged` and
  `sessionRevoked`, so a wallet narrowing or ending a session updates app state
  on every connector, not only WalletConnect. `isBurnDestination` now delegates
  to connect-core's unified `isBurnAddress`. Peer minimum for `@naculus/*` is
  `^0.2.6`.
- Updated dependencies [2250cd2]
- Updated dependencies [ee26569]
  - @naculus/connect-appkit-core@0.2.7
  - @naculus/connect-appkit-react@0.2.7

## 0.2.6

### Patch Changes

- Updated dependencies [a5c0f58]
- Updated dependencies [11a4fd8]
- Updated dependencies [622a46f]
- Updated dependencies [531cbc2]
- Updated dependencies [ef9ac4f]
- Updated dependencies [1c42c23]
- Updated dependencies [1ba2f9b]
- Updated dependencies [88f72c9]
- Updated dependencies [36f2ccc]
- Updated dependencies [a8ebb69]
  - @naculus/connect-appkit-core@0.2.6
  - @naculus/connect-appkit-react@0.2.6

## 0.2.5

### Patch Changes

- 46e710d: Detect MetaMask and Phantom providers that were injected before EIP-6963 discovery or do not announce. Apply theme tokens inside the Web Component shadow root.
- Updated dependencies [8ce3204]
- Updated dependencies [4b0024a]
- Updated dependencies [e4b85d9]
  - @naculus/connect-appkit-core@0.2.5
  - @naculus/connect-appkit-react@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [f012e61]
- Updated dependencies [9cd817d]
  - @naculus/connect-appkit-core@0.2.4
  - @naculus/connect-appkit-react@0.2.4

## 0.2.2

> These entries were written as changesets during 0.2.0 and 0.2.1 but never
> consumed at those releases, so they accumulated. They describe work shipped
> across 0.2.0, 0.2.1 and 0.2.2 rather than 0.2.2 alone, and are collected here
> because deleting them would have thrown away the only written record of what
> those releases contained.

### Changes

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
- 1d8b979: Stop assuming Ethereum mainnet when no chain is known.
  
  Seven call sites resolved a chain as `requested ?? connected ?? "eip155:1"` (or `?? 1`). Each now refuses instead:
  
  - `useSIWxLogin` and `useSignInWithX` fed that value into the `Chain ID:` field of the CAIP-122 message. With no connected chain the user signed an assertion about mainnet regardless of where the wallet actually was. They now throw `invalid_chain`.
  - `Web3ConnectProvider`'s `accountsChanged` handler re-keyed every account to `eip155:1:` CAIP-10 and saved the session, so a session on another chain came back from storage claiming addresses it never had there. It now leaves accounts untouched when the namespace has no EVM chain. The `namespace?.` access before the `if (!namespace) return` guard was also reordered.
  - `useTransactionSimulation`, `useSimulateTransfer`, and `useERC20TransferSimulation` previewed against mainnet, describing a transaction that would not be sent. They now throw rather than simulate on a guessed chain.
  - `useSmartAccount` and `useSendUserOperation` built UserOperations against mainnet's EntryPoint. The chain ID is part of the UserOperation hash, so this was a signed commitment to a chain the user was never shown. Chain resolution moved to a shared `resolveEvmChainId`, which also adds the CAIP-2 validation `useSmartAccount` never had.
  
  Callers that relied on the implicit mainnet default must now pass an explicit `chainId`.
  
  Also replaces `Math.random` with `crypto.getRandomValues` in the seed-phrase backup shuffle and the SIWx session record ID, matching the CSPRNG used everywhere else in the SDK.
- 1d8b979: Normalize both string hashes and embedded-wallet transaction result objects in
  `useSendTransaction`, and fail closed when a connector returns no valid EVM
  transaction hash. Restore a persisted embedded wallet on mount without
  re-exposing its recovery phrase, expose a fail-closed explicit restore action,
  and retry one transient empty IndexedDB read without creating a replacement.
  Prevent circular EIP-6963 provider objects
  from crossing the Web Component JSON boundary by serializing wallet display
  metadata only.
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
- 1d8b979: <!-- cspell:ignore appkit -->
  
  Add explicit ERC-7677 paymaster routing to call execution and fail closed when
  an application requires sponsorship but has no app-controlled sponsored
  UserOperation path.
  
  Embedded and passkey sessions now use their own connector when a chain switch
  falls back outside SessionManager, instead of being sent to WalletConnect. The
  chain selector also logs the underlying connector cause when a switch fails.
  An embedded wallet now retains its confirmed storage-security tier after a
  session disconnects instead of being misreported as plaintext localStorage.
- Updated dependencies [241f958]
- Updated dependencies [1d8b979]
- Updated dependencies [b995e99]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [aec3be4]
- Updated dependencies [1d8b979]
- Updated dependencies [c5ca02f]
- Updated dependencies [1d8b979]
- Updated dependencies [95eae67]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [b995e99]
- Updated dependencies [c5ca02f]
- Updated dependencies [961d3c9]
- Updated dependencies [95eae67]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [f1bd4f2]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [1d8b979]
- Updated dependencies [018855e]
- Updated dependencies [1d8b979]
- Updated dependencies [388674e]
- Updated dependencies [1d8b979]
- Updated dependencies [d17e61c]
- Updated dependencies [1d8b979]
- Updated dependencies [e246d16]
- Updated dependencies [0988380]
- Updated dependencies [471708d]
- Updated dependencies [c5ca02f]
- Updated dependencies [5fb7ad2]
  - @naculus/connect-appkit-react@1.0.0
  - @naculus/connect-appkit-core@1.0.0
