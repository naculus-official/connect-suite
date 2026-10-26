import {
  KeyStoreStorageAdapter,
  type StorageAdapter,
} from "@naculus/wallet-engine";
import type { AsyncStorageLike, SecureStoreLike } from "./types";

/**
 * The embedded wallet's storage on a phone: wallet-engine's
 * `KeyStoreStorageAdapter` with its key in iOS Keychain / Android Keystore
 * (`expo-secure-store`, this device only, when unlocked) and the sealed record
 * in AsyncStorage. Sealing happens inside wallet-engine; this only moves two
 * opaque strings. Pass as `embeddedConfig.storage`.
 *
 * Isolation is weaker than the web's worker: React Native has no Web Worker,
 * so signing runs on the JS thread. The Keystore makes the sealed record
 * useless off the device and keeps the key out of AsyncStorage. Needs
 * `crypto.getRandomValues` (`react-native-get-random-values`, which
 * `@walletconnect/react-native-compat` installs).
 */
export interface KeystoreWalletStorageOptions {
  secureStore: SecureStoreLike;
  asyncStorage: AsyncStorageLike;
  /** Names both the Keystore entry and the AsyncStorage record. */
  name?: string;
}

export function keystoreWalletStorage(
  options: KeystoreWalletStorageOptions,
): StorageAdapter {
  const { secureStore, asyncStorage } = options;
  const name = options.name ?? "naculus_wallet";
  const keyName = `${name}.key`;
  const recordName = `${name}.sealed`;
  const access =
    secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY !== undefined
      ? { keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
      : undefined;
  return new KeyStoreStorageAdapter({
    slot: name,
    keyStore: {
      load: () => secureStore.getItemAsync(keyName, access),
      save: (value) => secureStore.setItemAsync(keyName, value, access),
      delete: () => secureStore.deleteItemAsync(keyName),
    },
    blobStore: {
      read: () => asyncStorage.getItem(recordName),
      write: (value) => asyncStorage.setItem(recordName, value),
      remove: () => asyncStorage.removeItem(recordName),
    },
  });
}
