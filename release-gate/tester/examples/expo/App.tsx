import { EIP1193Provider, Wallets } from "@mobile-wallet-protocol/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useWeb3,
  Web3ConnectProvider,
  type Web3ConnectConfig,
} from "@naculus/connect-appkit-react";
import {
  buildSplTransferTransaction,
  detectPlatform,
  SOLANA_DEVNET,
  SOLANA_PROGRAMS,
  verifySignedSplTransfer,
} from "@naculus/connect-core";
import {
  asyncStorageSessionStorage,
  coinbaseMobileWallet,
  createMobileWalletAdapterWallet,
  keystoreWalletStorage,
  nativeWalletConnect,
  setupNaculusNative,
} from "@naculus/connect-native";
import { eip6963Connector } from "@naculus/connector-evm-injected";
import { isErc6492Signature } from "@naculus/siwx";
import { PocketWallet } from "@naculus/wallet-engine";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Button,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";

/**
 * Naculus React Native example and self-test (STATE thread 4).
 *
 * On launch it runs the checks that need no wallet app and logs one line,
 * `NACULUS_SELFTEST {json}`, for `adb logcat`. "Mobile Wallet Adapter"
 * runs the MWA round trip against an installed MWA wallet (the fake wallet
 * on the emulator).
 */

setupNaculusNative(Platform.OS);

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// Mobile Wallet Adapter is Android-only. Its native module does not exist on
// iOS, and importing the package there throws at startup, so load it only on
// Android.
const mwaWallet =
  Platform.OS === "android"
    ? createMobileWalletAdapterWallet({
        transact: (
          require("@solana-mobile/mobile-wallet-adapter-protocol-kit") as typeof import("@solana-mobile/mobile-wallet-adapter-protocol-kit")
        ).transact as never,
        identity: { name: "Naculus Native Example", uri: "https://naculus.dev" },
        chain: "solana:devnet",
      })
    : null;

const config: Web3ConnectConfig = {
  projectId: process.env.EXPO_PUBLIC_WC_PROJECT_ID ?? "naculus-native-example",
  metadata: {
    name: "Naculus Native Example",
    description: "React Native self-test",
    url: "https://naculus.dev",
    icons: [],
  },
  sessionStorage: asyncStorageSessionStorage(AsyncStorage),
  walletConnect: nativeWalletConnect(Linking),
  enableSolana: true,
  solanaDefaultChain: SOLANA_DEVNET,
  solanaWallets: mwaWallet ? [mwaWallet] : [],
  injectedProviders: [
    coinbaseMobileWallet(
      new EIP1193Provider({
        metadata: {
          name: "Naculus Native Example",
          logoUrl: "https://naculus.dev/icon.png",
          chainIds: [8453],
          customScheme: "naculusexample://",
        },
        wallet: Wallets.CoinbaseSmartWallet,
      }),
    ),
  ],
};

type Result = { name: string; ok: boolean; detail: string };

/** Wallet SDKs reject with plain `{ code, message }` objects as well as Errors. */
function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return `${error.name}${code !== undefined ? ` [${String(code)}]` : ""}: ${error.message}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function log(tag: string, results: Result[]) {
  console.log(`${tag} ${JSON.stringify(results)}`);
}

async function embeddedWalletCheck(): Promise<Result[]> {
  const results: Result[] = [];
  const storage = keystoreWalletStorage({
    secureStore: SecureStore,
    asyncStorage: AsyncStorage,
    name: "naculus_example_wallet",
  });
  await storage.clear();
  const first = new PocketWallet({ storage, chainId: "eip155:1" });
  await first.importMnemonic(TEST_MNEMONIC);
  const address = first.address;
  results.push({
    name: "embedded wallet derives the known address",
    ok: address?.toLowerCase() === "0x9858effd232b4033e47d90003d41ec34ecaeda94",
    detail: String(address),
  });
  const signed = await first.signMessage("hello from react native");
  results.push({
    name: "embedded wallet signs on the JS thread",
    ok: /^0x[0-9a-f]{130}$/i.test(String(signed.signature)),
    detail: String(signed.signature).slice(0, 20),
  });
  const sealed = (await AsyncStorage.getItem("naculus_example_wallet.sealed")) ?? "";
  results.push({
    name: "AsyncStorage holds only the sealed record",
    ok: sealed.length > 0 && !sealed.includes("abandon"),
    detail: `${sealed.length} chars`,
  });
  const second = new PocketWallet({ storage, chainId: "eip155:1" });
  const loaded = await second.load();
  results.push({
    name: "a new instance opens it with the Keystore key",
    ok: loaded && second.address === address,
    detail: String(second.address),
  });
  await storage.clear();
  return results;
}

function SelfTest() {
  const { client } = useWeb3();
  const [results, setResults] = useState<Result[]>([]);
  const [mwa, setMwa] = useState<Result[]>([]);
  const [coinbase, setCoinbase] = useState<Result[]>([]);

  useEffect(() => {
    (async () => {
      const out: Result[] = [
        {
          name: "platform is declared native",
          ok: detectPlatform() === `native-${Platform.OS}`,
          detail: detectPlatform(),
        },
      ];
      try {
        out.push(...(await embeddedWalletCheck()));
      } catch (error) {
        out.push({ name: "embedded wallet", ok: false, detail: String(error) });
      }
      const solana = (await (client as any).getSolanaConnector?.()) ??
        (client as any).solanaConnector;
      const wallets = solana?.getDiscoveredWallets?.() ?? [];
      const hasMwa = wallets.some(
        (w: { name: string }) => w.name === "Mobile Wallet Adapter",
      );
      out.push({
        name:
          Platform.OS === "android"
            ? "MWA wallet is registered with the Solana connector"
            : "MWA wallet is not registered on iOS (Android-only)",
        ok: Platform.OS === "android" ? hasMwa : !hasMwa,
        detail: wallets.map((w: { name: string }) => w.name).join(","),
      });
      const injected = eip6963Connector.getDiscoveredWallets();
      out.push({
        name: "Coinbase MWP provider is registered as an injected wallet",
        ok: injected.some((w) => w.id === "coinbase-mwp"),
        detail: injected.map((w) => w.id).join(","),
      });
      setResults(out);
      log("NACULUS_SELFTEST", out);
    })();
  }, [client]);

  const runMwa = async () => {
    const out: Result[] = [];
    try {
      const solana = (client as any).solanaConnector;
      const session = await solana.connect("wallet-standard-mobile-wallet-adapter");
      const account = session.namespaces.solana.accounts[0] as string;
      out.push({ name: "MWA connect", ok: Boolean(account), detail: account });
      const signature = (await client.signMessage(session, {
        message: "naculus mwa test",
      })) as number[];
      const address = account.split(":")[2] as string;
      out.push({
        name: "MWA signMessage verifies against the account",
        ok: ed25519.verify(
          Uint8Array.from(signature),
          new TextEncoder().encode("naculus mwa test"),
          base58.decode(address),
        ),
        detail: `${signature.length} bytes`,
      });
      // A real SPL payment, fee payer elsewhere: the wallet signs its slot and
      // the core verifier must accept what comes back.
      const payment = {
        feePayer: "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd",
        authority: address,
        mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        tokenProgram: SOLANA_PROGRAMS.token,
        decimals: 6,
        recipient: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
        amount: 1000n,
        memo: "naculus-native-example",
        recentBlockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
      };
      const signedTx = (await client.signTransaction(session, {
        transaction: {
          serialized: Array.from(buildSplTransferTransaction(payment)),
        } as never,
      })) as number[];
      verifySignedSplTransfer(Uint8Array.from(signedTx), payment);
      out.push({
        name: "MWA signTransaction passes the core payment verifier",
        ok: true,
        detail: `${signedTx.length} bytes`,
      });
      await solana.disconnect(session);
      out.push({ name: "MWA disconnect", ok: true, detail: "" });
    } catch (error) {
      out.push({ name: "MWA", ok: false, detail: String(error) });
    }
    setMwa(out);
    log("NACULUS_MWA", out);
  };

  // Coinbase Smart Wallet over Mobile Wallet Protocol: the app opens the
  // Coinbase keys page, the user approves with a passkey, and the result
  // comes back through the naculusexample:// scheme. A Smart Wallet signs as
  // a contract (ERC-1271; ERC-6492-wrapped while undeployed), so the
  // signature is logged and verified off-device against Base.
  const runCoinbase = async () => {
    const out: Result[] = [];
    try {
      const session = await client.connectInjected("coinbase-mwp");
      const account = session.namespaces.eip155?.accounts[0] ?? "";
      out.push({ name: "Coinbase connect", ok: account !== "", detail: account });
      const message = "naculus coinbase mwp test";
      const signature = String(
        await client.signMessage(session, { message }),
      );
      out.push({
        name: "Coinbase signMessage",
        ok: /^0x[0-9a-fA-F]+$/.test(signature),
        detail: `${(signature.length - 2) / 2} bytes${
          isErc6492Signature(signature) ? ", ERC-6492 (undeployed)" : ""
        }`,
      });
      console.log(
        `NACULUS_COINBASE_SIG ${JSON.stringify({ account, message, signature })}`,
      );
      await client.disconnect(session);
      out.push({ name: "Coinbase disconnect", ok: true, detail: "" });
    } catch (error) {
      out.push({ name: "Coinbase", ok: false, detail: describeError(error) });
    }
    setCoinbase(out);
    log("NACULUS_COINBASE", out);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Naculus React Native self-test</Text>
      {[...results, ...mwa, ...coinbase].map((r) => (
        <Text key={r.name} style={r.ok ? styles.ok : styles.fail}>
          {r.ok ? "PASS" : "FAIL"} {r.name} {r.detail ? `— ${r.detail}` : ""}
        </Text>
      ))}
      {Platform.OS === "android" ? (
        <Button title="Mobile Wallet Adapter" onPress={runMwa} />
      ) : null}
      <Button title="Coinbase Wallet (MWP)" onPress={runCoinbase} />
    </ScrollView>
  );
}

export default function App() {
  return (
    <Web3ConnectProvider config={config} autoConnect={false}>
      <SelfTest />
      <StatusBar style="auto" />
    </Web3ConnectProvider>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 8 },
  title: { fontSize: 18, fontWeight: "600" },
  ok: { color: "#0a7a2f" },
  fail: { color: "#b00020" },
});
