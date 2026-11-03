import {
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  SOLANA_TESTNET,
} from "@naculus/connect-core";
import type { SolanaProvider, WalletStandardWallet } from "./types";

/**
 * CAIP-2 chain ID → Wallet Standard chain identifier.
 *
 * `solana:signAndSendTransaction` requires a `chain` in Wallet Standard form
 * (`@solana/wallet-standard-chains`), not the CAIP-2 genesis-hash form the
 * session holds.
 */
const WALLET_STANDARD_CHAINS: Record<string, `${string}:${string}`> = {
  [SOLANA_MAINNET]: "solana:mainnet",
  [SOLANA_DEVNET]: "solana:devnet",
  [SOLANA_TESTNET]: "solana:testnet",
};

/**
 * Known wallet metadata for Solana wallets.
 */
export const SOLANA_WALLET_META: Record<
  string,
  { name: string; icon: string; rdns: string }
> = {
  phantom: {
    name: "Phantom",
    icon: "https://phantom.app/favicon.ico",
    rdns: "app.phantom",
  },
  solflare: {
    name: "Solflare",
    icon: "https://solflare.com/favicon.ico",
    rdns: "solflare-wallet",
  },
};

/**
 * Adapt a wallet-standard Wallet to our legacy SolanaProvider interface.
 */
export function createProviderFromWalletStandard(
  wallet: WalletStandardWallet,
  /** The session's CAIP-2 chain, read at call time for sign-and-send. */
  getChain?: () => string | undefined,
): SolanaProvider {
  const f = wallet.features as Record<string, any>;
  const requireFeature = <T>(name: string): T => {
    const feature = f[name] as T | undefined;
    if (!feature) {
      throw new Error(
        `Wallet Standard wallet is missing required feature: ${name}`,
      );
    }
    return feature;
  };
  const connectFeature = requireFeature<{
    connect: (opts?: unknown) => Promise<unknown>;
  }>("standard:connect");
  const disconnectFeature = f["standard:disconnect"];
  const signMessageFeature = f["solana:signMessage"];
  const signTxFeature = f["solana:signTransaction"];
  const signAllTxFeature = f["solana:signAllTransactions"];
  const signSendTxFeature = f["solana:signAndSendTransaction"];
  /**
   * Every `solana:*` feature is optional individually.
   *
   * `signMessage` and `signTransaction` used to be required, which dropped a
   * send-only wallet — a legitimate Wallet Standard configuration, and the
   * usual shape behind Mobile Wallet Adapter — out of the picker entirely, so
   * the user could not connect at all rather than connecting with a narrower
   * set of roles. `roles.ts` is what keeps an unsupported method from being
   * called; refusing the whole wallet here is a blunter answer than the one
   * the caller can now get.
   *
   * A wallet offering none of them is still refused: it is not a Solana
   * wallet, and every role would be empty.
   */
  if (!signMessageFeature && !signTxFeature && !signSendTxFeature) {
    throw new Error(
      "Wallet Standard wallet declares no solana: signing feature",
    );
  }
  const eventsFeature = f["standard:events"] as
    | { on?: (event: string, handler: (...args: unknown[]) => void) => unknown }
    | undefined;
  /** The account `standard:connect` returned; Wallet Standard inputs name it. */
  let connectedAccount: WalletStandardAccount | undefined;
  /**
   * The wallet's own account object for the connected address.
   *
   * Wallet Standard `solana:*` methods take `(...inputs)`, each input naming
   * the `account`. Wallets may compare it by identity against their
   * `accounts`, so the wallet's object is preferred over the copy from connect.
   */
  const currentAccount = (): WalletStandardAccount => {
    const account =
      (connectedAccount &&
        wallet.accounts?.find(
          (a) => a.address === connectedAccount?.address,
        )) ??
      connectedAccount ??
      wallet.accounts?.[0];
    if (!account) throw new Error("Wallet Standard wallet has no account");
    return account;
  };
  /** Unsubscribe callbacks returned by `standard:events`, keyed by handler. */
  const unsubscribes = new Map<(...args: unknown[]) => void, (() => void)[]>();

  return {
    async connect(opts) {
      const result = await connectFeature.connect(opts);
      const candidate =
        result && typeof result === "object" && "accounts" in result
          ? (result as { accounts?: readonly unknown[] }).accounts?.[0]
          : result;
      if (!isWalletStandardAccount(candidate)) {
        throw new Error(
          "Wallet Standard connect returned no valid Solana account",
        );
      }
      const account = candidate;
      connectedAccount = account;
      return {
        publicKey: {
          toString() {
            return account.address;
          },
          toBytes() {
            return account.publicKey;
          },
        },
      };
    },
    async disconnect() {
      await disconnectFeature?.disconnect();
    },
    async signMessage(message) {
      if (!signMessageFeature)
        throw new Error("Wallet does not support solana:signMessage");
      const [result] = await signMessageFeature.signMessage({
        account: currentAccount(),
        message,
      });
      return { signature: result.signature };
    },
    async signTransaction(tx) {
      if (!signTxFeature)
        throw new Error("Wallet does not support solana:signTransaction");
      const [result] = await signTxFeature.signTransaction({
        account: currentAccount(),
        transaction: tx,
      });
      return result.signedTransaction;
    },
    async signAllTransactions(txs) {
      if (!signAllTxFeature)
        throw new Error("Wallet does not support solana:signAllTransactions");
      const result = await signAllTxFeature.signAllTransactions(txs);
      return result.signedTransactions ?? result;
    },
    async signAndSendTransaction(tx) {
      if (!signSendTxFeature)
        throw new Error(
          "Wallet does not support solana:signAndSendTransaction",
        );
      const caip2 = getChain?.();
      const chain = caip2 ? WALLET_STANDARD_CHAINS[caip2] : undefined;
      if (!chain)
        throw new Error(
          "No Wallet Standard chain for solana:signAndSendTransaction",
        );
      const [result] = await signSendTxFeature.signAndSendTransaction({
        account: currentAccount(),
        transaction: tx,
        chain,
      });
      // Wallet Standard returns raw signature bytes; callers expect base58.
      return { signature: encodeBase58(result.signature) };
    },
    on(event, handler) {
      // `standard:events` returns an unsubscribe function. Discarding it left
      // the adapter with no way to detach, so a reconnect stacked another
      // handler on the same wallet and every account change was reported once
      // per connect that had ever happened.
      const off = eventsFeature?.on?.(event, handler);
      if (typeof off === "function") {
        let existing = unsubscribes.get(handler);
        if (!existing) {
          existing = [];
          unsubscribes.set(handler, existing);
        }
        existing.push(off as () => void);
      }
    },
    off(_event, handler) {
      for (const off of unsubscribes.get(handler) ?? []) {
        try {
          off();
        } catch {
          // A wallet that throws on unsubscribe must not block teardown.
        }
      }
      unsubscribes.delete(handler);
    },
  };
}

type WalletStandardAccount = WalletStandardWallet["accounts"][number];

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bitcoin-alphabet base58, as Solana uses for signatures. */
function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--)
    out += BASE58_ALPHABET[digits[i]];
  return out;
}

function isWalletStandardAccount(
  value: unknown,
): value is WalletStandardAccount {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { address?: unknown }).address === "string" &&
    (value as { publicKey?: unknown }).publicKey instanceof Uint8Array
  );
}

export function isPhantomInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as Record<string, unknown>;
  const phantom = win.phantom as { solana?: SolanaProvider } | undefined;
  const solana = win.solana as SolanaProvider | undefined;
  return !!(phantom?.solana || solana?.isPhantom);
}

export function isSolflareInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as unknown as Record<string, unknown>;
  const solflare = win.solflare as SolanaProvider | undefined;
  return !!solflare?.isSolflare;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
  }
  interface WindowEventMap {
    "wallet-standard:register-wallet": CustomEvent<WalletStandardWallet>;
  }
}
