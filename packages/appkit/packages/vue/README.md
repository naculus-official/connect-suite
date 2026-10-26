# @naculus/connect-appkit-vue

**Vue component wrappers for Naculus Connect Web Components** — auto-generated Vue proxies for all 28 Stencil components. Use `<connect-button>`, `<wallet-modal>`, etc. directly in Vue templates.

> **Components and composables have parity with React, with three named
> exceptions.** All 28 components are generated from the same Stencil source,
> so anything visual works the same in both. The composables cover the React
> hooks, including session keys and the transaction lifecycle, except:
>
> - React provider plumbing (`useWeb3`, `useViemClient`, `useWallet`,
>   `useWeb3ErrorHandler`) has no Vue counterpart by design;
> - `useERC20Allowance` is React-only today;
> - `useAccounts` is Vue-only.
>
> `useCapabilities` (the EIP-5792 query) and `useSolanaRoles` (which of
> `identity` / `signer` / `payer` the connected Solana wallet can fill) are not
> reimplementations: both bindings call the same functions in
> `@naculus/connect-appkit-core`, so "absence is not a denial" cannot mean one
> thing in React and another here.
>
> This is said here rather than discovered later. `docs/api.md` lists every
> runtime export of both packages.

> **🔗 Wraps `@naculus/connect-appkit-wc`. If you need the raw Web Components or another framework, see the table below.**

| Framework | Package |
|-----------|---------|
| Web Components (base) | `@naculus/connect-appkit-wc` |
| React | `@naculus/connect-appkit-react` |
| **Vue** | `@naculus/connect-appkit-vue` |
| UI (shared styles) | `@naculus/connect-appkit-ui` |

All four packages are released together on one version; install the same version of each.

## Install

```bash
npm install @naculus/connect-appkit-vue
# or
pnpm add @naculus/connect-appkit-vue
```

## Usage

See [Storybook](https://naculus-official.github.io/connect-appkit) for all components.

```vue
<template>
  <connect-button />
</template>

<script setup>
import "@naculus/connect-appkit-vue";
</script>
```

### Restoring SIWX sessions

`useSIWxSession` and `useSiwxAuthSession` are reactive shells: they do not read
storage or validate session dates. Before exposing a persisted session or SIWX
result to either composable, the caller must apply the shared appkit-core
policy. This rejects expired sessions, not-yet-valid sessions, and malformed
date strings instead of restoring them.

```ts
import {
  isSiwxExpired,
  isSiwxNotBeforeValid,
  type SiwxResultLike,
} from "@naculus/connect-appkit-core";
import { shallowRef } from "vue";

const restoredResult = shallowRef<SiwxResultLike | null>(null);
const candidate = await loadPersistedSiwxResult();
const now = new Date();

if (
  candidate &&
  !isSiwxExpired(candidate, now) &&
  isSiwxNotBeforeValid(candidate, now)
) {
  restoredResult.value = candidate;
}

// Pass restoredResult to useSiwxAuthSession. For useSIWxSession, expose the
// corresponding session only after the same check and provide isExpired from
// your caller-owned session policy.
```

### Authorization and verified receipts

`useAuthorizations({ managers })` lists the caller-owned EVM, Solana, and MPP
authorizations and refreshes after `revoke(entry)`. Inspect the returned
`onChainRevocationRequired` flag before declaring a Solana delegation revoked.

`usePaymentFetch(pay, { verify })` exposes a paid response immediately and
verifies its settlement in the background. Pending verification retries five
times at four-second intervals by default; pass `verifyRetry` to change that.

### Pay x402 from the connected wallet

Vue has no provider component, so `useX402Signer` takes the connection from
you: `useX402Signer(session, provider, switchChain, chainId)`. Pick the
provider with `findX402Provider` from `@naculus/connect-appkit-core`, which
chooses it by the session's wallet type, the same rule the React hook uses.
The injected wallets come from `@naculus/connector-evm-injected` and the
WalletConnect connector from `@naculus/connector-walletconnect`; install
whichever your app connects with.

```ts
import {
  findX402Provider,
  type PaymentFetch,
} from "@naculus/connect-appkit-core";
import type { SessionManager } from "@naculus/connect-core";
import {
  usePaymentFetch,
  useSession,
  useX402Signer,
} from "@naculus/connect-appkit-vue";
import { eip6963Connector } from "@naculus/connector-evm-injected";
import type { WalletConnectConnector } from "@naculus/connector-walletconnect";
import { createX402Fetch } from "@naculus/payments-x402";
import { computed } from "vue";

// Your app's SessionManager, and its WalletConnect connector if it has one.
declare const manager: SessionManager;
declare const walletConnect: WalletConnectConnector | null;

const { session, activeChainId } = useSession(manager);
const provider = computed(() =>
  findX402Provider(session.value, {
    injected: eip6963Connector.getDiscoveredWallets(),
    walletConnect,
  }),
);
const switchChain = (chainId: string) => manager.switchChain(chainId);

const { signer, reason } = useX402Signer(
  session,
  provider,
  switchChain,
  activeChainId,
);
const pay = computed<PaymentFetch | null>(() =>
  signer.value ? createX402Fetch({ signer: signer.value }) : null,
);
```

`signer` and `reason` are computed refs. `usePaymentFetch` takes a paying
fetch, not `null`, so call it in a child component that is rendered only once
`pay` is set (`<PaidResource v-if="pay" :pay="pay" />`):

```ts
// PaidResource.vue, <script setup lang="ts">
import type { PaymentFetch } from "@naculus/connect-appkit-core";
import { usePaymentFetch } from "@naculus/connect-appkit-vue";
import { toRef } from "vue";

const props = defineProps<{ pay: PaymentFetch }>();
const { payFetch, isPending, lastPayment, error } = usePaymentFetch(
  toRef(props, "pay"),
);
// Call payFetch(url) from an event handler.
```

`reason` is `null` whenever `signer` is set. Otherwise it says why there is no
signer, and what to show for it:

| `reason` | Meaning | Show |
|----------|---------|------|
| `"no-session"` | No wallet is connected. | The connect button. |
| `"not-evm"` | The session has no EVM (`eip155`) account, for example a Solana-only wallet. | Ask for an EVM account or an EVM wallet. |
| `"unsupported-wallet-type"` | The session is not an injected (EIP-6963) or WalletConnect wallet, or no provider was found for it. Embedded and passkey EVM wallets land here. | Offer a browser wallet or WalletConnect instead. |

The signer switches the wallet to the chain the server asks for before it
signs, through the `switchChain` you pass, so a wallet on another EVM chain is
not a `reason`.

WalletConnect sessions are supported when you pass the WalletConnect connector
to `findX402Provider`. The injected (EIP-6963) path is the one verified end to
end with real wallets; test WalletConnect against the wallets you target before
you rely on it.

## License

MIT
