import type { InjectedProviderRegistration } from "@naculus/connect-appkit-react";

/**
 * Coinbase Wallet on React Native through Mobile Wallet Protocol. The app
 * builds the provider — `new EIP1193Provider({ metadata, wallet:
 * Wallets.CoinbaseSmartWallet })` from `@mobile-wallet-protocol/client` —
 * and this registers it as an injected wallet (pass in
 * `config.injectedProviders`); connect with `connectInjected("coinbase-mwp")`.
 */
export function coinbaseMobileWallet(
  provider: unknown,
  info: Partial<InjectedProviderRegistration["info"]> = {},
): InjectedProviderRegistration {
  return {
    info: {
      uuid: info.uuid ?? "coinbase-mwp",
      name: info.name ?? "Coinbase Wallet",
      icon: info.icon ?? "data:image/svg+xml;base64,",
      rdns: info.rdns ?? "com.coinbase.wallet",
    },
    provider,
  };
}
