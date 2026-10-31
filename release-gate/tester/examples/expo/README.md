# Naculus React Native example (Expo)

Verifies `@naculus/connect-native` against the **packed tarballs** in
`../../artifacts` (as the release gate does — never the sibling sources).

## Run

```sh
# from the tester root: pack both SDKs
node release-gate/pack.mjs
# here: install the fresh tarballs (their version does not change between
# builds, so the lock entries are dropped first)
cd examples/expo && node scripts/refresh-naculus.mjs
npx expo prebuild --platform android
cd android && NODE_ENV=production ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n dev.naculus.nativeexample/.MainActivity
adb logcat -s ReactNativeJS:V | grep NACULUS_
```

iOS (Xcode 26.4 or later with the iOS 26.4 platform,
`xcodebuild -downloadPlatform iOS`):

```sh
npx expo prebuild --platform ios
npx expo run:ios --configuration Release --device "iPhone 16" --no-bundler
xcrun simctl spawn booted log stream --style compact \
  --predicate 'eventMessage CONTAINS "NACULUS_"'
```

`run:ios` exits non-zero after installing, when it tries to open the
development-client URL; relaunch with
`xcrun simctl launch booted dev.naculus.nativeexample`.

Gradle does not see changes under `node_modules`; delete
`android/app/build/generated/assets` before rebuilding or the APK keeps the old
JS bundle.

## What it checks

On launch (`NACULUS_SELFTEST`): the platform is declared native; the embedded
wallet (wallet-engine, in-thread signing on Hermes) derives the known address,
signs, is sealed in AsyncStorage under a Keystore key and opens again in a new
instance; the Coinbase MWP provider is registered; the MWA wallet is
registered on Android and absent on iOS. Mobile Wallet Adapter is
Android-only: `App.tsx` requires it behind `Platform.OS === "android"`,
because importing it on iOS throws at startup. Verified on the Android
emulator (API 33) and the iOS simulator (iPhone 16, iOS 26.4) on 2026-09-29.

"Mobile Wallet Adapter" (`NACULUS_MWA`), with Solana Mobile's fake wallet
installed (`fakewallet-v1-debug.apk` from the mobile-wallet-adapter v2.2.0
release): connect on devnet, sign a message (verified with ed25519 against the
account), sign an SPL payment transaction (accepted by connect-core's
`verifySignedSplTransfer`), disconnect.

"Coinbase Wallet (MWP)" (`NACULUS_COINBASE`): connects the Coinbase Smart
Wallet over Mobile Wallet Protocol (the keys.coinbase.com page opens, the user
approves with a passkey — the device needs a Google account and a screen lock),
signs a message and disconnects. A Smart Wallet signs as a contract (ERC-1271,
ERC-6492-wrapped while undeployed), so the signature is logged as
`NACULUS_COINBASE_SIG` and verified off-device against Base.

Not covered here: WalletConnect against the real relay (set
`EXPO_PUBLIC_WC_PROJECT_ID`).
