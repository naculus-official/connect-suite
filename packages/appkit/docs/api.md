# API Reference

> Hand-written high-level overview. For the full type-level API surface, see TypeScript declarations in each package.
>
> Only runtime (value) exports are listed below. Type-only exports (`Use*Options`, `Use*Return`, `*Props`, view and record types) are left to each package's declarations; the complete, machine-checked list of every export, types included, lives in [`api-surface/`](../api-surface) (`pnpm api:check`).

| Package | Role |
|---------|------|
| `@naculus/connect-appkit-core` | Framework-free logic shared by every binding |
| `@naculus/connect-appkit-react` | React provider, hooks and Web Component wrappers |
| `@naculus/connect-appkit-vue` | Vue composables and Web Component wrappers |
| `@naculus/connect-appkit-ui` | React components (connect, wallet, authorization, payments) |
| `@naculus/connect-appkit-wc` | Stencil Web Components — the base of the React/Vue wrappers |
| `@naculus/connect-native` | React Native adapters and payment UI |

---

## @naculus/connect-appkit-core — Framework-free logic

Install: `pnpm add @naculus/connect-appkit-core`

Everything here imports no framework; the React hooks and Vue composables are thin shells over it.

### Chains

| Export | Description |
|--------|-------------|
| `chainNamespace` | The namespace a chain belongs to, read from its CAIP-2 id. |
| `chainNumber` | The EIP-155 chain number, or `null` for a non-EVM chain. |
| `chainsForNamespace` | The configured chains worth offering for the session's namespace. |
| `describeChain` | A display description of the connected chain, for every namespace. |
| `resolveChain` | The configured chain for a CAIP-2 id, or `null`. |
| `resolveEvmChainId` | The EVM chain to operate on (explicit request wins over connected), or `undefined`. |
| `isEvmChainId` | Whether a chain id is an EIP-155 chain. |
| `eip155ChainIdToNumber` | Numeric EIP-155 chain id, or `undefined` for any other namespace. |
| `normalizeEip155ChainId` | Convert an EIP-1193 `chainChanged` value into CAIP-2 form. |
| `toViemChain` | Build the chain descriptor a viem client needs, or `null` for a non-EVM chain. |
| `toChainSwitchError` | Map a chain-switch failure onto the error code that describes it. |

### Wallet capabilities and Solana roles

| Export | Description |
|--------|-------------|
| `normalizeCapabilities` | Turn a wallet's raw EIP-5792 `wallet_getCapabilities` answer into per-chain entries. |
| `selectChainCapabilities` | Find the capabilities entry for a chain, by CAIP-2 or hex id. |
| `atomicSupportFor` | Atomic-batch support for a chain, `"unknown"` whenever the wallet has not said. |
| `readSolanaRoles` | Which of `identity` / `signer` / `payer` the connected Solana wallet can fill. |

### Connection state

| Export | Description |
|--------|-------------|
| `initialWeb3State` | Initial state of the connection state machine. |
| `web3Reducer` | Reducer of the connection state machine shared by the bindings. |
| `toEip155Accounts` | Convert session accounts into CAIP-10 `eip155` accounts. |
| `withRetry` | Retry an async operation up to `maxRetries` times. |
| `withTimeout` | Reject an async operation that does not settle in time. |
| `bareEvmAddress` | The bare `0x…` address from a CAIP-10 id or plain hex address, else `null`. |
| `assertHexSignature` | Assert a wallet's signing answer is non-empty, even-length hex. |

### Tokens and ERC-20

| Export | Description |
|--------|-------------|
| `encodeErc20Transfer` | Encode `transfer(address,uint256)` calldata without signing or broadcasting. |
| `encodeErc20Approve` | Encode `approve(address,uint256)` calldata without signing or broadcasting. |
| `encodeErc20TransferFrom` | Encode `transferFrom(address,address,uint256)` calldata without signing or broadcasting. |
| `tokenChainMismatch` | A mismatch when a token is not on the active chain, or `undefined` when it is or cannot be told. |
| `createDecimalsCache` | Create a per-token cache of ERC-20 decimals. |
| `readDecimals` | Read cached decimals for a token, resetting the cache when it holds another token. |
| `writeDecimals` | Write a token's decimals into the cache. |
| `tokenKey` | Cache key for a token. |

### Errors and simulation

| Export | Description |
|--------|-------------|
| `decodeRevertReason` | Decode raw revert data into a reason string. |
| `resolveRevertReason` | The decoded revert reason if available, otherwise the node's own message. |
| `resolveSimulationEndpoint` | Resolve a simulation target without guessing a default chain. |
| `resolveContextSimulationEndpoint` | Resolve the simulation chain from an explicit override or CAIP-2 context. |
| `simulateTransactionPreview` | Basic revert check for a transaction; never claims asset changes or risk coverage. |

### Names and addresses

| Export | Description |
|--------|-------------|
| `getResolver` | The shared ENS/SNS name resolver, or a dedicated one when config is supplied. |
| `validateDestination` | Validate a destination address and report warnings. |
| `isBurnDestination` | Whether an address is a burn/sink address. |

### Notifications

| Export | Description |
|--------|-------------|
| `createNotification` | Create an in-app notification record. |
| `addInAppNotification` | Add a notification to the in-app channel. |
| `clearOneInAppNotification` | Remove one in-app notification, preserving the channel's clear/replay behavior. |
| `channelsUpdate` | Settings update that enables the given delivery channels. |
| `mutedChainSettings` | Settings update that turns notifications on or off for one chain. |
| `DEFAULT_NOTIFICATION_SETTINGS` | Default notification settings. |
| `NOTIFICATION_SETTINGS_KEY` | Storage key for persisted notification settings. |
| `createNotificationSettingsStorage` | localStorage-backed notification-settings storage with a fail-open fallback. |
| `loadNotificationSettings` | Load persisted notification settings. |
| `saveNotificationSettings` | Persist notification settings. |
| `updateNotificationSettings` | Apply a change to notification settings. |
| `replayNotificationSettings` | Replay changes made before persisted settings finished loading on top of them. |

### Routing (chain abstraction)

| Export | Description |
|--------|-------------|
| `isPositiveIntegerAmount` | Whether an amount is a positive base-unit integer and therefore quotable. |
| `isQuotableInput` | Whether every field a route quote needs is present and valid. |
| `compareCostsKey` | Stable value key for a compare-costs input, so inline literals do not re-fetch. |
| `validateRouteRecipient` | Validate the recipient before a cross-chain execution against the destination namespace. |
| `toExecuteRouteError` | Normalize whatever a route executor threw into the hook's error shape. |

### Account abstraction and delegation

| Export | Description |
|--------|-------------|
| `buildSmartAccountConfig` | Smart-account config from owner, CAIP-2 chain and options, with a per-chain entry-point fallback. |
| `resolveUserOpChain` | Target chain for a UserOperation; fails closed on a missing or mismatched chain. |
| `parseUserOperationReceipt` | Validate an `eth_getUserOperationReceipt` result. |
| `fetchUserOperationReceipt` | One `eth_getUserOperationReceipt` call, resolving to the validated receipt or `null`. |
| `InvalidUserOperationReceiptError` | Error thrown for a malformed bundler receipt. |
| `createDelegationFrameworkAdapter` | Adapter for executing through the delegation framework. |
| `createDelegationPolicyFlow` | Create, sign and verify delegation policies (off-chain or EIP-7702). |
| `buildDelegationPolicyMessage` | The exact, deterministic message the main wallet signs for a policy. |
| `isVerifiablePolicy` | Whether a stored policy is a verification candidate. |
| `sameExecutionIntent` | Whether an adapter's prepared transaction still means what was requested (fail-closed). |

### Session keys

| Export | Description |
|--------|-------------|
| `getSharedSessionKeyManager` | The shared session-key manager instance. |
| `resetSharedSessionKeyManager` | Drop the shared session-key manager (tests, full sign-out). |
| `sessionKeyConfigFingerprint` | Fingerprint of the config fields that change what a key may spend or how it is sealed. |
| `createSolanaSessionKeyFlow` | Create Solana session keys that pay x402 / MPP without a prompt. |

### Authorizations (consent, listing, spend)

| Export | Description |
|--------|-------------|
| `describeAuthorization` | Network-free consent/listing view of an authorization, including periodic limits, enforcement and `trustedAssets` checks. |
| `explainSpend` | Explain the shared evaluator's allow/refuse result for a UI, without changing the decision. |
| `formatAuthorizationAmount` | Format an authorization amount with asset metadata, or in base units without it. |

### Payments (x402 / MPP)

| Export | Description |
|--------|-------------|
| `findX402Provider` | The EIP-1193 provider that belongs to a session, chosen by its wallet type. |
| `resolveX402Wallet` | Resolve the connected EVM payer for x402 from the session. |
| `createX402WalletSigner` | Build the x402 signer after applying the shared session-routing policy. |
| `describePayment` | The payment a paying fetch made (x402 or MPP, EVM or Solana), marked `unverified`. |
| `applySettlementVerification` | Apply a settlement verifier result to a payment record without mutating it. |
| `DEFAULT_VERIFY_RETRY` | Default settlement-verification retry (5 attempts, 4 s apart). |
| `readMppSessionChannel` | Return an MPP session channel only when all public fields have the expected shape. |
| `readCurrentMppSessionChannel` | The newest structurally valid channel currently held by an MPP session. |
| `readMppSessionReceipt` | Return an MPP receipt only when it has the public success-receipt shape. |
| `readMppRecoveryChannelId` | The recoverable channel carried by a post-send channel-open failure. |

### SIWx policy

| Export | Description |
|--------|-------------|
| `defaultSiwxDomain` | SIWx domain from a location's host (`localhost` without one). |
| `defaultSiwxUri` | SIWx URI from a location's origin (`http://localhost` without one). |
| `isSiwxExpired` | Whether a SIWx session has expired. |
| `isSiwxNotBeforeValid` | Whether a SIWx session's not-before time has passed. |
| `siwxResultToSession` | Convert a SIWx sign-in result into a storable session record. |

---

## @naculus/connect-appkit-react — Provider, hooks & components

Install: `pnpm add @naculus/connect-appkit-react`

### Provider and client

| Export | Description |
|--------|-------------|
| `Web3ConnectProvider` | Core provider: owns the client, session state and React context. |
| `Web3Context` | The raw React context behind the provider. |
| `useWeb3` | Access the raw Web3 context. Low-level escape hatch. |
| `createClient` | Create the framework-free client (also exported from `@naculus/connect-appkit-react/client`). |
| `getClient` | The current client instance (also in `/client`). |
| `clearClient` | Drop the current client instance (also in `/client`). |
| `useViemClient` | A viem client for the connected EVM chain. |

### Wallet and session

| Export | Description |
|--------|-------------|
| `useWallet` | Combined wallet state and actions. |
| `useConnect` | Connect flow — connectors, `connect`, status and error. |
| `useDisconnect` | Disconnect the current session. |
| `useAccount` | The connected accounts, split by namespace. |
| `useSession` | The complete session state: chain sessions, active chain and status. |
| `useChain` | The connected chain and the chains it is possible to switch to. |
| `useSwitchChain` | Switch the connected chain. |
| `useBalance` | Native balance of the connected account. |
| `useCapabilities` | What the connected wallet can do — EIP-5792 `wallet_getCapabilities`. |
| `useEmbeddedWallet` | Embedded-wallet accounts and actions. |
| `usePassphraseGate` | Drive the passphrase prompt for the embedded wallet's encrypted storage. |
| `PassphraseGate` | The passphrase gate class (re-exported from connect-core). |
| `PassphraseCancelledError` | Error raised when the user cancels a passphrase prompt (re-exported from connect-core). |

### Transactions and batching

| Export | Description |
|--------|-------------|
| `useSendTransaction` | Send a single EVM transaction. |
| `useSendCalls` | Send a batch of calls (EIP-5792) with a sequential fallback. |
| `useExecuteCalls` | Route calls to an executor that honors the caller's atomicity requirement, or refuse. |
| `useSignMessage` | Sign a message with the connected wallet. |
| `useTransactionSimulation` | Simulate a transaction before sending. |
| `useSimulateTransfer` | Simulate an ERC-20 transfer, building calldata automatically. |
| `useLastTx` | The most recent transaction, updated on status changes. |
| `useTxHistory` | Transaction history for an address and chain. |
| `useTxMonitor` | Monitor a single transaction's lifecycle. |
| `TxMonitorContext` | Context supplying the transaction monitor to `useTxMonitor`. |

### ERC-20 and tokens

| Export | Description |
|--------|-------------|
| `useERC20Transfer` | ERC-20 transfer. |
| `useERC20Approve` | ERC-20 approval. |
| `useERC20Allowance` | ERC-20 allowance query. |
| `useERC20TransferSimulation` | Simulate an ERC-20 transfer before sending. |
| `useTokenBalance` | Token balance with metadata. |
| `useTokenList` | Token list for a chain. |
| `useTokenSearch` | Debounced token search by symbol, name or address. |
| `TokenSelector` | Dropdown/modal component for selecting a token. |

### Solana

| Export | Description |
|--------|-------------|
| `useSolanaAccount` | The connected Solana account, whichever wallet supplied it. |
| `useSolanaBalance` | SOL balance of the connected Solana account. |
| `useSolanaTransaction` | Sign and send Solana transactions through the connected wallet. |
| `useSolanaRoles` | Which roles (`identity` / `signer` / `payer`) the connected Solana account can fill. |
| `getSolanaBalance` | Read a SOL balance over RPC (re-exported from connect-core). |
| `getLatestBlockhash` | Read the latest blockhash over RPC (re-exported from connect-core). |
| `getSignatureStatus` | Read a signature's confirmation status over RPC (re-exported from connect-core). |
| `formatSol` | Format lamports as SOL (re-exported from connect-core). |
| `parseSol` | Parse a SOL string into lamports (re-exported from connect-core). |
| `LAMPORTS_PER_SOL` | Lamports in one SOL (re-exported from connect-core). |
| `SolanaRpcError` | Error raised by a failed Solana RPC call (re-exported from connect-core). |

### SIWx (Sign-In With X)

| Export | Description |
|--------|-------------|
| `useSignInWithX` | CAIP-122 sign-in for the connected namespace. |
| `useSignInWithEthereum` | EVM CAIP-122 sign-in. |
| `useSIWxLogin` | Simplified sign-in trigger with loading/error state. |
| `useSIWxSession` | SIWx session lifecycle — sign in / out / refresh, persistence and expiry. |
| `useSiwxAuthSession` | Older SIWx auth-session shell, superseded by `useSIWxSession`. |

### Session keys and delegation

| Export | Description |
|--------|-------------|
| `useSessionKeys` | List and manage session keys. |
| `useCreateSessionKey` | Create a session key. |
| `useRevokeSession` | Revoke a session key. |
| `useSendWithSession` | Sign with a session key and check its scope. |
| `resetSessionKeyManager` | Reset the global session-key manager (tests, cleanup). |
| `useSolanaSessionKey` | Solana session keys that pay x402 / MPP without a prompt. |
| `useDelegate` | EIP-7702: delegate or revoke the connected embedded account via a type-4 transaction. |
| `useDelegation` | Whether the connected EOA currently delegates to contract code (EIP-7702). |
| `useDelegationPolicy` | Create and verify local, signed, persistent session policies. |
| `buildDelegationPolicyMessage` | The deterministic message the main wallet signs for a policy (from appkit-core). |

### Account abstraction

| Export | Description |
|--------|-------------|
| `useSmartAccount` | ERC-4337 smart-account lifecycle. |
| `useSendUserOperation` | Send ERC-4337 UserOperations to a bundler. |
| `useUserOpStatus` | Poll a UserOperation's status with validated receipts. |

### Chain abstraction

| Export | Description |
|--------|-------------|
| `useRouteQuote` | Cross-chain route quotes. |
| `useExecuteRoute` | Execute a quoted route. |
| `useCompareCosts` | Compare costs across routes and chains. |

### Payments and authorizations

| Export | Description |
|--------|-------------|
| `usePaymentFetch` | State around a caller-owned paying fetch (`createX402Fetch` or `createMppFetch`). |
| `useX402Signer` | An x402 signer for the connected external EVM wallet, or a `reason` it cannot sign. |
| `useMppSession` | Reactive state around an app-built MPP session fetch — metering, channel and receipt. |
| `useAuthorizations` | List caller-owned EVM, Solana and MPP authorizations and `revoke(entry)` them. |

### Names and addresses

| Export | Description |
|--------|-------------|
| `useResolveName` | Resolve an ENS (`.eth`) or SNS (`.sol`) name to an address. |
| `useLookupAddress` | Reverse-resolve an address to a name. |
| `useValidateDestination` | Validate a destination address with warnings. |
| `validateDestination` | Non-hook destination validation (from appkit-core). |

### Notifications, errors, chains and i18n

| Export | Description |
|--------|-------------|
| `useNotification` | Consume in-app notifications. |
| `useWeb3ErrorHandler` | Map wallet errors to user-friendly messages with retry detection. |
| `getUserFriendlyError` | A user-friendly error message object from any error. |
| `isRetryableError` | Whether an error is transient and worth retrying. |
| `WALLET_ERROR_TITLES` | User-friendly title for each `WalletError` code. |
| `WALLET_ERROR_DESCRIPTIONS` | User-friendly description for each `WalletError` code. |
| `DEFAULT_EVM_CHAINS` | Default EVM chain list. |
| `getDefaultChains` | The default chain configuration. |
| `getChainById` | The configured chain for a CAIP-2 id. |
| `t` | i18n translator function. |
| `getLocale` | The current i18n locale. |
| `setLocale` | Set the i18n locale. |

### Web Component wrappers

| Export | Description |
|--------|-------------|
| `AppkitAccordion` … `AppkitTooltip` (28) | React wrappers for each `<appkit-*>` element listed under [connect-appkit-wc](#naculusconnect-appkit-wc--web-components): `AppkitAccordion`, `AppkitAccountButton`, `AppkitAlertDialog`, `AppkitAvatar`, `AppkitBadge`, `AppkitButton`, `AppkitCard`, `AppkitCardContent`, `AppkitCardDescription`, `AppkitCardFooter`, `AppkitCardHeader`, `AppkitCardTitle`, `AppkitCheckbox`, `AppkitCollapsible`, `AppkitConnectButton`, `AppkitDialog`, `AppkitDropdownMenu`, `AppkitInput`, `AppkitPopover`, `AppkitProgress`, `AppkitScrollArea`, `AppkitSelect`, `AppkitSeparator`, `AppkitSkeleton`, `AppkitSwitch`, `AppkitTabs`, `AppkitToggleGroup`, `AppkitTooltip`. |

---

## @naculus/connect-appkit-vue — Composables & components

Install: `pnpm add @naculus/connect-appkit-vue`

Composables mirror the React hooks of the same name (same appkit-core logic, Vue refs instead of React state). The React-only provider plumbing — `useWeb3`, `useViemClient`, `useWallet`, `useWeb3ErrorHandler` — has no Vue counterpart by design; Vue composables take caller-owned actions instead of reading a provider. `useERC20Allowance` also has no Vue export today, and the non-hook React helpers (client, chain, error, i18n and Solana RPC utilities, `TokenSelector`, `TxMonitorContext`) are React-only exports.

### Composables mirroring React

| Export | Description |
|--------|-------------|
| `useAccount` | Connected accounts, split by namespace. |
| `useSession` | Complete session state. |
| `useConnect` | Connect flow. |
| `useDisconnect` | Disconnect the current session. |
| `useChain` | Connected chain and switchable chains. |
| `useSwitchChain` | Switch the connected chain. |
| `useBalance` | Native balance through a caller-supplied reader. |
| `useCapabilities` | EIP-5792 capabilities query (same appkit-core functions as React). |
| `useEmbeddedWallet` | Embedded-wallet accounts and actions. |
| `usePassphraseGate` | Drive the embedded wallet's passphrase prompt. |
| `useSignMessage` | Sign a message through a caller-owned action. |
| `useSendTransaction` | Send an EVM transaction through a caller-owned action. |
| `useSendCalls` | EIP-5792 batch calls. |
| `useExecuteCalls` | Route calls to an executor honouring atomicity, or refuse. |
| `useTransactionSimulation` | Simulate a transaction before sending. |
| `useSimulateTransfer` | Simulate an ERC-20 transfer. |
| `useLastTx` | The most recent transaction. |
| `useTxHistory` | Transaction history. |
| `useTxMonitor` | Monitor a single transaction's lifecycle. |
| `useERC20Transfer` | ERC-20 transfer. |
| `useERC20Approve` | ERC-20 approval. |
| `useERC20TransferSimulation` | Simulate an ERC-20 transfer before sending. |
| `useTokenBalance` | Token balance through a caller-supplied reader. |
| `useTokenList` | Token list for a chain. |
| `useTokenSearch` | Token search. |
| `useSolanaAccount` | The connected Solana account. |
| `useSolanaBalance` | SOL balance of the connected Solana account. |
| `useSolanaTransaction` | Sign and send Solana transactions through caller-owned actions. |
| `useSolanaRoles` | Which Solana roles the connected wallet can fill (same appkit-core functions as React). |
| `useSignInWithX` | CAIP-122 sign-in. |
| `useSignInWithEthereum` | EVM CAIP-122 sign-in. |
| `useSIWxLogin` | Simplified sign-in trigger. |
| `useSIWxSession` | Reactive SIWx session shell (apply the appkit-core SIWx policy before restoring). |
| `useSiwxAuthSession` | Reactive SIWx auth-session shell. |
| `useSessionKeys` | List and manage session keys. |
| `useCreateSessionKey` | Create a session key. |
| `useRevokeSession` | Revoke a session key. |
| `useSendWithSession` | Sign with a session key and check its scope. |
| `useSolanaSessionKey` | Solana session keys that pay x402 / MPP without a prompt. |
| `useDelegate` | EIP-7702 delegate / revoke. |
| `useDelegation` | Whether the connected EOA delegates to contract code. |
| `useDelegationPolicy` | Local, signed, persistent session policies. |
| `useSmartAccount` | ERC-4337 smart-account lifecycle. |
| `useSendUserOperation` | Send ERC-4337 UserOperations. |
| `useUserOpStatus` | UserOperation status polling. |
| `useRouteQuote` | Cross-chain route quotes. |
| `useExecuteRoute` | Execute a quoted route. |
| `useCompareCosts` | Compare route costs. |
| `usePaymentFetch` | State around a caller-owned paying fetch. |
| `useX402Signer` | An x402 signer for the connected external EVM wallet. |
| `useMppSession` | Reactive state around an app-built MPP session fetch. |
| `useAuthorizations` | List and revoke caller-owned authorizations. |
| `useResolveName` | Resolve an ENS / SNS name. |
| `useLookupAddress` | Reverse-resolve an address. |
| `useValidateDestination` | Validate a destination address. |
| `useNotification` | Consume in-app notifications. |

### Vue-only

| Export | Description |
|--------|-------------|
| `useAccounts` | Split a session's account list by what each entry is (the reading React's `useAccount` does internally). |

### Web Component wrappers

| Export | Description |
|--------|-------------|
| `AppkitAccordion` … `AppkitTooltip` (28) | Vue proxies for each `<appkit-*>` element: `AppkitAccordion`, `AppkitAccountButton`, `AppkitAlertDialog`, `AppkitAvatar`, `AppkitBadge`, `AppkitButton`, `AppkitCard`, `AppkitCardContent`, `AppkitCardDescription`, `AppkitCardFooter`, `AppkitCardHeader`, `AppkitCardTitle`, `AppkitCheckbox`, `AppkitCollapsible`, `AppkitConnectButton`, `AppkitDialog`, `AppkitDropdownMenu`, `AppkitInput`, `AppkitPopover`, `AppkitProgress`, `AppkitScrollArea`, `AppkitSelect`, `AppkitSeparator`, `AppkitSkeleton`, `AppkitSwitch`, `AppkitTabs`, `AppkitToggleGroup`, `AppkitTooltip`. |

---

## @naculus/connect-appkit-ui — React components

Install: `pnpm add @naculus/connect-appkit-ui` (styles: `@naculus/connect-appkit-ui/styles`)

### Connect and account

| Export | Description |
|--------|-------------|
| `ConnectButton` | Primary connect / disconnect entry point. |
| `AccountButton` | Address display with account actions. |
| `ChainSelector` | Chain switching dropdown. |
| `SignInButton` | SIWx sign-in button with session-aware UI. |
| `WalletPicker` | Wallet selection list. |
| `QRCodeModal` | WalletConnect QR code modal. |
| `AddressWarningDialog` | Confirmation dialog for a risky destination address. |
| `AccountSelector` | Choose which embedded-wallet account signs. |
| `AccountSelectorView` | Presentation of `AccountSelector` with a caller-supplied account source. |

### AppKit and layout

| Export | Description |
|--------|-------------|
| `AppKit` | Full connection UI with its own context. |
| `useAppKit` | Access the `AppKit` context. |
| `AppKitButton` | Connect button bound to the `AppKit` context. |
| `AppKitChainSelector` | Chain selector bound to the `AppKit` context. |
| `Web3ConnectUI` | Connection UI with wallet detection mode (auto / WalletConnect / EIP-6963). |
| `useDetectionMode` | The current `Web3ConnectUI` detection mode. |
| `ErrorBoundary` | Error boundary for the connect UI. |

### Embedded wallet security

| Export | Description |
|--------|-------------|
| `WalletSecurityPanel` | Read and render the embedded wallet's storage-security report. |
| `WalletSecurityPanelView` | Presentation of `WalletSecurityPanel` for a caller-held report. |
| `PassphraseDialog` | Ask for the passphrase that encrypts the embedded wallet, only while storage is blocked on it. |
| `PassphraseDialogView` | Presentation of `PassphraseDialog`. |
| `PasskeySetup` | Register a passkey for the embedded wallet and re-seal its stored record. |
| `PasskeySetupView` | Presentation of `PasskeySetup`. |
| `SeedPhraseBackup` | Seed phrase backup flow. |

### Authorizations and payments

| Export | Description |
|--------|-------------|
| `AuthorizationConsent` | Consent view for an authorization — amounts, period limits, on-chain / device enforcement, trusted-asset status, approve / decline. |
| `AuthorizationList` | List of authorizations with period and enforcement display and an `onRevoke` action. |
| `PaymentReceipt` | Payment receipt that shows settlement as verified only after verification. |

### Routing and smart wallet

| Export | Description |
|--------|-------------|
| `RouteSelector` | Cross-chain route selection UI. |
| `SmartWalletToggle` | Smart-account deploy / upgrade toggle with status. |
| `SmartWalletSettings` | Smart-wallet account, paymaster and bundler settings form. |

### Theme, registry and providers

| Export | Description |
|--------|-------------|
| `ThemeProvider` | Theme context with a priority system (fallback / computed / custom). |
| `useTheme` | Access the theme context. |
| `useThemeVariable` | Read one theme variable. |
| `Web3ComponentProvider` | Pluggable component overrides. |
| `useComponentRegistry` | Access the component registry. |
| `useComponent` | Resolve one component from the registry. |
| `WalletConnectProvider` | WalletConnect pairing state provider. |
| `useWalletConnect` | Access the WalletConnect context (throws outside the provider). |
| `useWalletConnectOptional` | Access the WalletConnect context, or nothing outside the provider. |

### Utilities

| Export | Description |
|--------|-------------|
| `cn` | Tailwind class merge (`clsx` + `tailwind-merge`). |
| `useIsMobile` | Whether the user is on an iOS or Android device. |
| `useEIP6963` | Discover browser wallets via EIP-6963. |

---

## @naculus/connect-appkit-wc — Web Components

Install: `pnpm add @naculus/connect-appkit-wc`

Framework-agnostic Stencil components; the React and Vue `Appkit*` wrappers are generated from them. Register them with the loader.

### Loader (`@naculus/connect-appkit-wc/loader`)

| Export | Description |
|--------|-------------|
| `defineCustomElements` | Register every `<appkit-*>` custom element. |
| `setNonce` | Set the CSP nonce for injected styles. |

### Custom elements

| Element | Description |
|---------|-------------|
| `<appkit-connect-button>` | Connect / disconnect button. |
| `<appkit-account-button>` | Connected account button. |
| `<appkit-button>` | Button. |
| `<appkit-input>` | Text input. |
| `<appkit-checkbox>` | Checkbox. |
| `<appkit-switch>` | Toggle switch. |
| `<appkit-select>` | Select. |
| `<appkit-toggle-group>` | Toggle group. |
| `<appkit-tabs>` | Tabs. |
| `<appkit-accordion>` | Accordion. |
| `<appkit-collapsible>` | Collapsible section. |
| `<appkit-dialog>` | Dialog. |
| `<appkit-alert-dialog>` | Alert dialog. |
| `<appkit-popover>` | Popover. |
| `<appkit-dropdown-menu>` | Dropdown menu. |
| `<appkit-tooltip>` | Tooltip. |
| `<appkit-card>` | Card container. |
| `<appkit-card-header>` | Card header. |
| `<appkit-card-title>` | Card title. |
| `<appkit-card-description>` | Card description. |
| `<appkit-card-content>` | Card content. |
| `<appkit-card-footer>` | Card footer. |
| `<appkit-avatar>` | Avatar. |
| `<appkit-badge>` | Badge. |
| `<appkit-progress>` | Progress bar. |
| `<appkit-skeleton>` | Loading skeleton. |
| `<appkit-scroll-area>` | Scroll area. |
| `<appkit-separator>` | Separator. |

The package root exports only types (`Components`, `JSX`, `*CustomEvent`, variant/size enums).

---

## @naculus/connect-native — React Native

Install: `pnpm add @naculus/connect-native`

### Platform and storage

| Export | Description |
|--------|-------------|
| `setupNaculusNative` | Tell connect-core it runs in a native app (pass `Platform.OS`). |
| `asyncStorageAdapter` | connect-core `StorageAdapter` over AsyncStorage, under a key prefix. |
| `asyncStorageSessionStorage` | Session storage for `Web3ConnectProvider` on React Native (`config.sessionStorage`). |
| `keystoreWalletStorage` | Embedded-wallet storage: key in iOS Keychain / Android Keystore, sealed record in AsyncStorage. |

### Wallets

| Export | Description |
|--------|-------------|
| `nativeWalletConnect` | WalletConnect on React Native, with deep links through `Linking`. |
| `installedWallets` | The wallets whose apps are installed on the device. |
| `coinbaseMobileWallet` | Coinbase Wallet through Mobile Wallet Protocol. |
| `createMobileWalletAdapterWallet` | A Solana wallet over Mobile Wallet Adapter. |
| `kitTransactionFromWire` | Wire transaction → Solana Kit transaction. |
| `wireFromKitTransaction` | Solana Kit transaction → wire, in signer order. |
| `base58Encode` | base58 (Bitcoin alphabet) encoding, as Solana uses. |

### Payment UI (`@naculus/connect-native/ui`)

| Export | Description |
|--------|-------------|
| `AuthorizationConsentNative` | React Native counterpart of `AuthorizationConsent`. |
| `AuthorizationListNative` | React Native counterpart of `AuthorizationList`. |
| `PaymentReceiptNative` | React Native counterpart of `PaymentReceipt`. |
| `NativePaymentThemeProvider` | Theme provider for the native payment UI. |
| `useNativePaymentTheme` | Read the native payment theme. |
| `lightPaymentTheme` | Light native payment theme. |
| `darkPaymentTheme` | Dark native payment theme. |
