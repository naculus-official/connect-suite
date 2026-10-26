# @naculus/connect-appkit-react

**React bindings for Naculus Connect** — 54 hooks plus auto-generated React
wrappers for all 28 Stencil components.

The components are the smaller half. Two files in this package contain JSX; the
rest is connection state, capability negotiation, session keys, simulation and
transaction lifecycle, reachable as hooks.

> **🔗 Wraps `@naculus/connect-appkit-wc`. If you need the raw Web Components or another framework, see the table below.**

| Framework | Package |
|-----------|---------|
| Web Components (base) | `@naculus/connect-appkit-wc` |
| **React** | `@naculus/connect-appkit-react` |
| Vue | `@naculus/connect-appkit-vue` |
| UI (shared styles) | `@naculus/connect-appkit-ui` |

All four packages are released together on one version; install the same version of each.

## Install

```bash
npm install @naculus/connect-appkit-react
# or
pnpm add @naculus/connect-appkit-react
```

## Usage

See [Storybook](https://naculus-official.github.io/connect-appkit) for all components.

```tsx
import { ConnectButton } from "@naculus/connect-appkit-react";

function App() {
  return <ConnectButton />;
}
```

## Hooks

<!-- This list is the point of the package and was missing from the README that
     npm renders, so people reading the npm page concluded the capability layer
     did not exist. Keep it in step with `src/index.ts`. -->

**Connection** — `useAccount`, `useConnect`, `useDisconnect`, `useWallet`,
`useSession`, `useChain`, `useSwitchChain`, `useWeb3`, `useWeb3ErrorHandler`

**Capabilities and batched calls (EIP-5792)** — `useCapabilities`,
`useSendCalls`, `useExecuteCalls`

**Smart accounts and delegation (ERC-4337, EIP-7702)** — `useSmartAccount`,
`useSendUserOperation`, `useUserOpStatus`, `useDelegation`,
`useDelegationPolicy`

**Session keys** — `useCreateSessionKey`, `useSessionKeys`,
`useSendWithSession`, `useRevokeSession`

**Sign-in (EIP-4361 / CAIP-122)** — `useSIWxLogin`, `useSIWxSession`,
`useSiwxAuthSession`, `useSignInWithEthereum`, `useSignInWithX`,
`useSignMessage`

**Transactions** — `useSendTransaction`, `useTxMonitor`, `useTxHistory`,
`useLastTx`, `useSimulateTransfer`, `useTransactionSimulation`,
`useValidateDestination`

**Tokens and balances** — `useBalance`, `useTokenBalance`, `useTokenList`,
`useTokenSearch`, `useERC20Allowance`, `useERC20Approve`, `useERC20Transfer`,
`useERC20TransferSimulation`

**Routing** — `useRouteQuote`, `useExecuteRoute`, `useCompareCosts`

**Solana** — `useSolanaAccount`, `useSolanaBalance`, `useSolanaTransaction`,
`useSolanaRoles`

**Embedded wallet** — `useEmbeddedWallet`, `usePassphraseGate`

**Names** — `useResolveName`, `useLookupAddress`

**Other** — `useViemClient`, `useNotification`

### Authorization and verified receipts

`useAuthorizations({ managers })` lists the caller-owned EVM, Solana, and MPP
authorizations and refreshes after `revoke(entry)`. Inspect the returned
`onChainRevocationRequired` flag before declaring a Solana delegation revoked.

`usePaymentFetch(pay, { verify })` records a paid response immediately, then
verifies its settlement in the background. Pending verification retries five
times at four-second intervals by default; pass `verifyRetry` to change that.

### Pay x402 from the connected wallet

`useX402Signer()` reads the connected session from `Web3ConnectProvider` and
returns `{ signer, reason }`. Build the paying fetch with
`createX402Fetch({ signer })` from `@naculus/payments-x402`, then hand it to
`usePaymentFetch`. `usePaymentFetch` takes a paying fetch, not `null`, so
render the component that calls it only once `signer` exists:

```tsx
import type { PaymentFetch } from "@naculus/connect-appkit-core";
import { usePaymentFetch, useX402Signer } from "@naculus/connect-appkit-react";
import { createX402Fetch } from "@naculus/payments-x402";
import { useMemo } from "react";

const REASON_TEXT = {
  "no-session": "Connect a wallet to pay.",
  "not-evm": "Switch to an EVM account to pay with x402.",
  "unsupported-wallet-type":
    "This wallet cannot sign x402 payments here. Connect a browser wallet or use WalletConnect.",
} as const;

function PayWithWallet() {
  const { signer, reason } = useX402Signer();
  const pay = useMemo(
    () => (signer ? createX402Fetch({ signer }) : null),
    [signer],
  );

  if (!pay) return <p>{reason ? REASON_TEXT[reason] : null}</p>;
  return <PaidResource pay={pay} />;
}

function PaidResource({ pay }: { pay: PaymentFetch }) {
  const { payFetch, isPending, lastPayment, error } = usePaymentFetch(pay);
  // Call payFetch(url) from an event handler; render isPending, lastPayment
  // and error.
  return null;
}
```

`reason` is `null` whenever `signer` is set. Otherwise it says why there is no
signer, and what to show for it:

| `reason` | Meaning | Show |
|----------|---------|------|
| `"no-session"` | No wallet is connected. | The connect button. |
| `"not-evm"` | The session has no EVM (`eip155`) account, for example a Solana-only wallet. | Ask for an EVM account or an EVM wallet. |
| `"unsupported-wallet-type"` | The session is not an injected (EIP-6963) or WalletConnect wallet, or its provider is no longer available. Embedded and passkey EVM wallets land here. | Offer a browser wallet or WalletConnect instead. |

The signer switches the wallet to the chain the server asks for before it
signs, so a wallet on another EVM chain is not a `reason`.

WalletConnect sessions are supported: the hook signs through the WalletConnect
connector. The injected (EIP-6963) path is the one verified end to end with
real wallets; test WalletConnect against the wallets you target before you rely
on it.

### Ask before executing

```tsx
const { atomic } = useCapabilities();

if (atomic === "supported") {
  await sendCalls(calls);        // one batch, all or nothing
}
```

`atomic` is `"supported" | "unsupported" | "unknown"`. A wallet that does not
implement `wallet_getCapabilities` has not said no — EIP-5792 is explicit that
absence is not a denial, and `"unknown"` also covers a query that failed or is
still in flight.

### Ask a Solana wallet which role it can fill

```tsx
const { signer, payer, absence } = useSolanaRoles();

if (absence === null && signer === null) {
  // The wallet said so: it signs and sends, but will not hand back a signed
  // transaction. Offer another wallet before the co-signing flow starts.
}
```

`signer` and `payer` are `null` when the wallet declared it cannot fill that
role. `absence` says why there is no answer at all — `"no_session"`,
`"not_solana"`, or `"unreported"` for a `@naculus/connector-solana` older
than the roles API — so a wallet that has not been asked is never shown as one
that cannot sign. Reading roles never prompts.

## License

MIT
