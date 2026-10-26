/**
 * The React Native modules this package wires, described by the members it
 * uses. The app passes the real ones (`import AsyncStorage from
 * "@react-native-async-storage/async-storage"`, `import { Linking, Platform }
 * from "react-native"`, …): nothing here imports React Native, so every
 * native peer stays optional and the package loads (and tests) anywhere.
 */

/** `@react-native-async-storage/async-storage` default export. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

/** `react-native` `Linking`. */
export interface LinkingLike {
  openURL(url: string): Promise<unknown>;
  canOpenURL(url: string): Promise<boolean>;
}

/** `expo-secure-store` (Keychain / Keystore). */
export interface SecureStoreLike {
  getItemAsync(
    key: string,
    options?: { keychainAccessible?: number },
  ): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: { keychainAccessible?: number },
  ): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
  /** `SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`. */
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: number;
}
