import {
  buildSplTransferTransaction,
  detectPlatform,
  isMobileDevice,
  parseSolanaTransaction,
  SOLANA_PROGRAMS,
  setPlatformOverride,
  verifySignedSplTransfer,
} from "@naculus/connect-core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asyncStorageAdapter,
  asyncStorageSessionStorage,
  base58Encode,
  coinbaseMobileWallet,
  createMobileWalletAdapterWallet,
  installedWallets,
  keystoreWalletStorage,
  kitTransactionFromWire,
  type MwaWalletLike,
  nativeWalletConnect,
  setupNaculusNative,
  wireFromKitTransaction,
} from "./index";

function fakeAsyncStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
    getAllKeys: async () => [...data.keys()],
    multiRemove: async (keys: readonly string[]) => {
      for (const k of keys) data.delete(k);
    },
  };
}

function fakeSecureStore() {
  const data = new Map<string, string>();
  const access: (number | undefined)[] = [];
  return {
    data,
    access,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    getItemAsync: async (k: string) => data.get(k) ?? null,
    setItemAsync: async (
      k: string,
      v: string,
      o?: { keychainAccessible?: number },
    ) => {
      access.push(o?.keychainAccessible);
      data.set(k, v);
    },
    deleteItemAsync: async (k: string) => {
      data.delete(k);
    },
  };
}

describe("platform", () => {
  afterEach(() => setPlatformOverride(null));

  it("declares the native platform to connect-core", () => {
    setupNaculusNative("android");
    expect(detectPlatform()).toBe("native-android");
    expect(isMobileDevice()).toBe(true);
    setupNaculusNative("ios");
    expect(detectPlatform()).toBe("native-ios");
    setupNaculusNative("web");
    expect(detectPlatform()).not.toMatch(/^native/);
  });
});

describe("AsyncStorage adapters", () => {
  it("stores JSON under a prefix and clears only its own keys", async () => {
    const storage = fakeAsyncStorage();
    await storage.setItem("other", "keep");
    const adapter = asyncStorageAdapter(storage, "nx:");
    await adapter.set("a", { n: 1 });
    expect(await adapter.get("a")).toEqual({ n: 1 });
    expect(await adapter.has("a")).toBe(true);
    await adapter.clear();
    expect(await adapter.get("a")).toBeNull();
    expect(storage.data.get("other")).toBe("keep");
  });

  it("persists the session, and drops an unreadable one", async () => {
    const storage = fakeAsyncStorage();
    const sessions = asyncStorageSessionStorage(storage, "s");
    const session = { id: "wc-1", walletType: "walletconnect" } as never;
    await sessions.save(session);
    expect(await sessions.load()).toEqual(session);
    await storage.setItem("s", "{not json");
    expect(await sessions.load()).toBeNull();
    expect(storage.data.has("s")).toBe(false);
  });
});

describe("WalletConnect on React Native", () => {
  it("opens deep links through Linking", async () => {
    const linking = { openURL: vi.fn(async () => true), canOpenURL: vi.fn() };
    await nativeWalletConnect(linking).openUrl?.("metamask://wc?uri=x");
    expect(linking.openURL).toHaveBeenCalledWith("metamask://wc?uri=x");
  });

  it("lists wallets whose apps answer canOpenURL", async () => {
    const linking = {
      openURL: vi.fn(),
      canOpenURL: vi.fn(async (url: string) => {
        if (url.startsWith("broken")) throw new Error("not declared");
        return url.startsWith("metamask");
      }),
    };
    const found = await installedWallets(linking, [
      { id: "mm", name: "MetaMask", deepLink: "metamask://wc" },
      { id: "rb", name: "Rainbow", deepLink: "rainbow://wc" },
      { id: "x", name: "Broken", deepLink: "broken://wc" },
    ]);
    expect(found.map((w) => w.id)).toEqual(["mm"]);
  });
});

describe("Coinbase Mobile Wallet Protocol", () => {
  it("registers the app's EIP-1193 provider as an injected wallet", () => {
    const provider = { request: vi.fn() };
    expect(coinbaseMobileWallet(provider)).toEqual({
      info: {
        uuid: "coinbase-mwp",
        name: "Coinbase Wallet",
        icon: "data:image/svg+xml;base64,",
        rdns: "com.coinbase.wallet",
      },
      provider,
    });
  });
});

// ── Mobile Wallet Adapter ─────────────────────────────────────────

const SEED = new Uint8Array(32).fill(7);
const PUBLIC = ed25519.getPublicKey(SEED);
const ADDRESS = base58Encode(PUBLIC);
const FEE_PAYER = base58Encode(
  ed25519.getPublicKey(new Uint8Array(32).fill(9)),
);
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAY_TO = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";

/** A wallet app answering MWA as the Kit flavour does, signing for real. */
function fakeWalletApp() {
  const calls: string[] = [];
  const wallet: MwaWalletLike = {
    authorize: async (params) => {
      calls.push(params.auth_token ? "reauthorize" : "authorize");
      return {
        accounts: [{ address: btoa(String.fromCharCode(...PUBLIC)) }],
        auth_token: "token-1",
      };
    },
    deauthorize: async () => {
      calls.push("deauthorize");
    },
    signMessages: async ({ payloads }) =>
      payloads.map((m) => new Uint8Array([...m, ...ed25519.sign(m, SEED)])),
    signTransactions: async ({ transactions }) =>
      transactions.map((tx) => ({
        messageBytes: tx.messageBytes,
        signatures: {
          ...tx.signatures,
          [ADDRESS]: ed25519.sign(tx.messageBytes, SEED),
        },
      })),
    signAndSendTransactions: async ({ transactions }) =>
      transactions.map((tx) => ed25519.sign(tx.messageBytes, SEED)),
  };
  const transact = async <T>(cb: (w: MwaWalletLike) => Promise<T>) =>
    cb(wallet);
  return { calls, transact };
}

const payment = () => ({
  feePayer: FEE_PAYER,
  authority: ADDRESS,
  mint: USDC,
  tokenProgram: SOLANA_PROGRAMS.token,
  decimals: 6,
  recipient: PAY_TO,
  amount: 1000n,
  memo: "0123456789abcdef",
  recentBlockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
});

describe("Mobile Wallet Adapter as a Wallet Standard wallet", () => {
  it("round-trips wire and Kit transactions in the signer order", () => {
    const wire = buildSplTransferTransaction(payment());
    const kit = kitTransactionFromWire(wire);
    expect(Object.keys(kit.signatures)).toEqual([FEE_PAYER, ADDRESS]);
    expect(Object.values(kit.signatures)).toEqual([null, null]);
    expect(wireFromKitTransaction(kit)).toEqual(wire);
  });

  it("connects and reports the account in base58", async () => {
    const { transact, calls } = fakeWalletApp();
    const wallet = createMobileWalletAdapterWallet({
      transact,
      identity: { name: "Naculus" },
      chain: "solana:mainnet",
    });
    const { accounts } = await wallet.features["standard:connect"].connect();
    expect(accounts[0]?.address).toBe(ADDRESS);
    expect(accounts[0]?.publicKey).toEqual(PUBLIC);
    expect(calls).toEqual(["authorize"]);
  });

  it("signs a payment transaction the core verifier accepts", async () => {
    const { transact, calls } = fakeWalletApp();
    const wallet = createMobileWalletAdapterWallet({
      transact,
      identity: { name: "Naculus" },
      chain: "solana:mainnet",
    });
    await wallet.features["standard:connect"].connect();
    const { signedTransaction } = await wallet.features[
      "solana:signTransaction"
    ].signTransaction(buildSplTransferTransaction(payment()));
    expect(verifySignedSplTransfer(signedTransaction, payment())).toMatch(
      /^[A-Za-z0-9+/]+=*$/,
    );
    // The facilitator's slot is still empty: partially signed.
    expect(
      parseSolanaTransaction(signedTransaction).signatures[0]?.every(
        (b) => b === 0,
      ),
    ).toBe(true);
    expect(calls).toEqual(["authorize", "reauthorize"]);
  });

  it("returns the message signature and a base58 send signature", async () => {
    const { transact } = fakeWalletApp();
    const wallet = createMobileWalletAdapterWallet({
      transact,
      identity: {},
      chain: "solana:devnet",
    });
    await wallet.features["standard:connect"].connect();
    const message = new TextEncoder().encode("hello");
    const { signature } =
      await wallet.features["solana:signMessage"].signMessage(message);
    expect(ed25519.verify(signature, message, PUBLIC)).toBe(true);
    const sent = await wallet.features[
      "solana:signAndSendTransaction"
    ].signAndSendTransaction(buildSplTransferTransaction(payment()));
    expect(sent.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  });

  it("tells the connector when re-authorization returns another account", async () => {
    const { transact } = fakeWalletApp();
    const other = ed25519.getPublicKey(new Uint8Array(32).fill(3));
    let first = true;
    const switching: typeof transact = async (cb) =>
      transact((wallet) =>
        cb({
          ...wallet,
          authorize: async (params) => {
            const r = await wallet.authorize(params);
            if (first) {
              first = false;
              return r;
            }
            return {
              ...r,
              accounts: [{ address: btoa(String.fromCharCode(...other)) }],
            };
          },
        }),
      );
    const wallet = createMobileWalletAdapterWallet({
      transact: switching,
      identity: {},
      chain: "solana:mainnet",
    });
    const changes: unknown[] = [];
    wallet.features["standard:events"].on("change", (c) => changes.push(c));
    await wallet.features["standard:connect"].connect();
    changes.length = 0;
    await wallet.features["solana:signMessage"].signMessage(
      new TextEncoder().encode("x"),
    );
    expect(changes).toEqual([
      { accounts: [expect.objectContaining({ address: base58Encode(other) })] },
    ]);
  });

  it("refuses a malformed account or signature from the wallet", async () => {
    const { transact } = fakeWalletApp();
    const bad: typeof transact = async (cb) =>
      transact((wallet) =>
        cb({
          ...wallet,
          authorize: async () => ({
            accounts: [{ address: btoa("short") }],
            auth_token: "t",
          }),
        }),
      );
    const wallet = createMobileWalletAdapterWallet({
      transact: bad,
      identity: {},
      chain: "solana:mainnet",
    });
    await expect(wallet.features["standard:connect"].connect()).rejects.toThrow(
      /malformed account/,
    );
    const kit = kitTransactionFromWire(buildSplTransferTransaction(payment()));
    kit.signatures[ADDRESS] = new Uint8Array(65);
    expect(() => wireFromKitTransaction(kit)).toThrow(/malformed signature/);
  });

  it("deauthorizes and forgets the account on disconnect", async () => {
    const { transact, calls } = fakeWalletApp();
    const wallet = createMobileWalletAdapterWallet({
      transact,
      identity: {},
      chain: "solana:mainnet",
    });
    await wallet.features["standard:connect"].connect();
    await wallet.features["standard:disconnect"].disconnect();
    expect(calls).toContain("deauthorize");
    expect(wallet.accounts).toEqual([]);
  });
});

// ── Keystore-sealed embedded wallet storage ───────────────────────

describe("keystoreWalletStorage", () => {
  const record = {
    mnemonic: "abandon abandon abandon",
    accounts: [],
    activeNamespace: "eip155",
    createdAt: 1,
    version: 2,
  } as never;

  it("seals the record under a Keystore key and opens it again", async () => {
    const secureStore = fakeSecureStore();
    const asyncStorage = fakeAsyncStorage();
    const storage = keystoreWalletStorage({ secureStore, asyncStorage });
    expect(await storage.load()).toBeNull();
    await storage.save(record);
    expect(await storage.load()).toEqual(record);
    // The key is only in the Keystore, device-only; AsyncStorage holds no
    // readable mnemonic.
    expect(secureStore.access).toEqual([6]);
    expect([...asyncStorage.data.values()].join()).not.toMatch(/abandon/);
    expect([...asyncStorage.data.keys()]).toEqual(["naculus_wallet.sealed"]);
  });

  it("refuses an altered record, and a record whose key is gone", async () => {
    const secureStore = fakeSecureStore();
    const asyncStorage = fakeAsyncStorage();
    const storage = keystoreWalletStorage({ secureStore, asyncStorage });
    await storage.save(record);
    const sealed = asyncStorage.data.get("naculus_wallet.sealed") as string;
    const bytes = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
    bytes[20] = (bytes[20] as number) ^ 1;
    asyncStorage.data.set(
      "naculus_wallet.sealed",
      btoa(String.fromCharCode(...bytes)),
    );
    await expect(storage.load()).rejects.toThrow(/does not open/);
    secureStore.data.clear();
    await expect(storage.load()).rejects.toThrow(/key is gone/);
  });

  it("does not open another slot's record with its key", async () => {
    const secureStore = fakeSecureStore();
    const asyncStorage = fakeAsyncStorage();
    const a = keystoreWalletStorage({ secureStore, asyncStorage, name: "a" });
    await a.save(record);
    // Copy a's record and key into slot b: the slot name is authenticated.
    asyncStorage.data.set(
      "b.sealed",
      asyncStorage.data.get("a.sealed") as string,
    );
    secureStore.data.set("b.key", secureStore.data.get("a.key") as string);
    const b = keystoreWalletStorage({ secureStore, asyncStorage, name: "b" });
    await expect(b.load()).rejects.toThrow(/does not open/);
  });

  it("clears the record and the key", async () => {
    const secureStore = fakeSecureStore();
    const asyncStorage = fakeAsyncStorage();
    const storage = keystoreWalletStorage({ secureStore, asyncStorage });
    await storage.save(record);
    await storage.clear();
    expect(asyncStorage.data.size).toBe(0);
    expect(secureStore.data.size).toBe(0);
  });
});

describe("entry points", () => {
  it("keeps the payment UI out of the main entry", async () => {
    // The main entry must load under Node without React Native; the UI lives
    // in @naculus/connect-native/ui.
    const main = await import("./index");
    for (const name of [
      "AuthorizationConsentNative",
      "AuthorizationListNative",
      "PaymentReceiptNative",
      "NativePaymentThemeProvider",
    ]) {
      expect(main).not.toHaveProperty(name);
    }
  });
});
