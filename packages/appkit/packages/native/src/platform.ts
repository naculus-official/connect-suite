import { setPlatformOverride } from "@naculus/connect-core";

/**
 * Tell connect-core it runs in a native app (`Platform.OS` from
 * react-native). React Native cannot be told apart from a browser by
 * `navigator`; without this, connectors record sessions as `desktop-web` and
 * the connector manager does not prefer mobile-capable connectors.
 */
export function setupNaculusNative(os: string): void {
  if (os === "ios") setPlatformOverride("native-ios");
  else if (os === "android") setPlatformOverride("native-android");
  else setPlatformOverride(null);
}
