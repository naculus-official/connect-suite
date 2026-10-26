# @naculus/connect-native

Naculus Connect for React Native. The React hooks from
`@naculus/connect-appkit-react` run unchanged; this package supplies the
native pieces `Web3ConnectProvider` needs.

```tsx
// index.js — before anything else
import "@walletconnect/react-native-compat";

// App.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";
import { EIP1193Provider, Wallets } from "@mobile-wallet-protocol/client";
import { Web3ConnectProvider } from "@naculus/connect-appkit-react";
import {
  asyncStorageSessionStorage,
  coinbaseMobileWallet,
  createMobileWalletAdapterWallet,
  keystoreWalletStorage,
  nativeWalletConnect,
  setupNaculusNative,
} from "@naculus/connect-native";

setupNaculusNative(Platform.OS);

const config = {
  projectId, // WalletConnect Cloud
  metadata,
  sessionStorage: asyncStorageSessionStorage(AsyncStorage),
  walletConnect: nativeWalletConnect(Linking),
  enableSolana: true,
  // Mobile Wallet Adapter is Android-only: importing it on iOS throws at
  // startup, so require it only on Android.
  solanaWallets:
    Platform.OS === "android"
      ? [
          createMobileWalletAdapterWallet({
            transact: require("@solana-mobile/mobile-wallet-adapter-protocol-kit").transact,
            identity: { name: "My App", uri: "https://myapp.example" },
            chain: "solana:mainnet",
          }),
        ]
      : [],
  injectedProviders: [
    coinbaseMobileWallet(
      new EIP1193Provider({ metadata: { name: "My App" }, wallet: Wallets.CoinbaseSmartWallet }),
    ),
  ],
  enableEmbedded: true,
  embeddedConfig: {
    storage: keystoreWalletStorage({ secureStore: SecureStore, asyncStorage: AsyncStorage }),
  },
};

export default () => <Web3ConnectProvider config={config}>{/* … */}</Web3ConnectProvider>;
```

Every native module is passed in by the app, so each peer is optional:
install only what you use.

| Piece | Peer | What it does |
|---|---|---|
| `setupNaculusNative(Platform.OS)` | `react-native` | Tells connect-core it runs natively (sessions record `native-ios` / `native-android`; mobile-capable connectors are preferred) |
| `asyncStorageSessionStorage` / `asyncStorageAdapter` | `@react-native-async-storage/async-storage` | Session persistence |
| `nativeWalletConnect(Linking)`, `installedWallets` | `@walletconnect/react-native-compat` | WalletConnect deep links via `Linking.openURL`; relay storage in AsyncStorage (import the compat package first) |
| `createMobileWalletAdapterWallet` | `@solana-mobile/mobile-wallet-adapter-protocol-kit` | Solana Mobile Wallet Adapter (Android) as a Wallet Standard wallet |
| `coinbaseMobileWallet(provider)` | `@mobile-wallet-protocol/client` | Coinbase Wallet over Mobile Wallet Protocol, connected with `connectInjected("coinbase-mwp")` |
| `keystoreWalletStorage` | `expo-secure-store` | Embedded wallet record sealed by wallet-engine (AES-256-GCM) under a Keychain / Keystore key (this device, when unlocked) |

**Mobile Wallet Adapter is Android-only.** Its native module does not exist
on iOS, and `@solana-mobile/mobile-wallet-adapter-protocol-kit` throws as
soon as it is imported there (`TurboModuleRegistry.getEnforcing(...):
'SolanaMobileWalletAdapter' could not be found`), before any UI renders.
Never import it at the top of a file that also runs on iOS: `require` it
behind `Platform.OS === "android"` as above, or keep it in a `.android.ts`
file.

**Keep `config` stable** (module scope or `useMemo`): `Web3ConnectProvider`
rebuilds its client when these objects change identity.

**Randomness:** `crypto.getRandomValues` must exist —
`@walletconnect/react-native-compat` installs `react-native-get-random-values`;
import it first. The embedded wallet's key generation fails closed without it.
Coinbase MWP (`@mobile-wallet-protocol/client`) also calls
`crypto.randomUUID`, which Hermes does not provide; without it connecting the
Smart Wallet fails with "undefined is not a function". Install a v4 UUID
polyfill built on `crypto.getRandomValues` before the app loads (the Expo
example's `crypto-random-uuid.ts` is one).

**Clusters:** the MWA wallet's `chain` must match `solanaDefaultChain`; a
mismatch fails on send rather than paying on another cluster.

**Embedded wallet isolation.** React Native has no Web Worker, so the
embedded wallet signs on the JS thread; the web build's worker isolation does
not apply. What the Keystore adds is that the sealed record is useless off the
device and the key never touches AsyncStorage.

**Not included:** UI components (the web components are DOM-only — use the
hooks and your own views) and passkeys.
