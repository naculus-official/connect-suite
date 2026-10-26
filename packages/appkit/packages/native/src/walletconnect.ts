import type { NativeWalletConnectOptions } from "@naculus/connect-appkit-react";
import type { LinkingLike } from "./types";

/**
 * WalletConnect on React Native: deep links open through `Linking`. The
 * SignClient builds itself; with `@walletconnect/react-native-compat`
 * imported first in the app's entry file, its storage is AsyncStorage.
 */
export function nativeWalletConnect(
  linking: LinkingLike,
): NativeWalletConnectOptions {
  return {
    openUrl: async (url) => {
      await linking.openURL(url);
    },
  };
}

export interface WalletLinkTarget {
  id: string;
  name: string;
  /** Deep-link base the WalletConnect URI is appended to, e.g. `metamask://wc`. */
  deepLink: string;
}

/**
 * The wallets whose apps are installed. iOS answers only for schemes listed
 * under `LSApplicationQueriesSchemes` in Info.plist, Android only for those in
 * the manifest's `<queries>`; anything else reads as not installed.
 */
export async function installedWallets(
  linking: LinkingLike,
  wallets: readonly WalletLinkTarget[],
): Promise<WalletLinkTarget[]> {
  const checks = await Promise.all(
    wallets.map(async (wallet) => {
      try {
        return await linking.canOpenURL(wallet.deepLink);
      } catch {
        return false;
      }
    }),
  );
  return wallets.filter((_, i) => checks[i]);
}
