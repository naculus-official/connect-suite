import { parseSolanaTransaction, WalletError } from "@naculus/connect-core";
import { base58Encode, base64Decode } from "./codec";

/**
 * Solana Mobile Wallet Adapter as a Wallet Standard wallet, for
 * connector-solana's `registerWallet` (pass it in `config.solanaWallets`).
 *
 * Each operation opens one MWA session with `transact` (from
 * `@solana-mobile/mobile-wallet-adapter-protocol-kit`, passed in by the app),
 * re-authorizes with the stored auth token and asks the wallet app. Wire
 * transactions become the Kit `{ messageBytes, signatures }` objects that
 * package expects and back; the signer order is taken from the message.
 */

/** MWA's app identity, shown by the wallet. */
export interface MwaAppIdentity {
  name?: string;
  uri?: string;
  icon?: string;
}

type KitTransaction = {
  messageBytes: Uint8Array;
  signatures: Record<string, Uint8Array | null>;
};

/** The members of the Kit `KitMobileWallet` used here. */
export interface MwaWalletLike {
  authorize(params: {
    identity: MwaAppIdentity;
    chain?: string;
    auth_token?: string;
  }): Promise<{
    accounts: readonly { address: string; label?: string }[];
    auth_token: string;
  }>;
  deauthorize(params: { auth_token: string }): Promise<unknown>;
  signMessages(params: {
    addresses: string[];
    payloads: Uint8Array[];
  }): Promise<Uint8Array[]>;
  signTransactions(params: {
    transactions: KitTransaction[];
  }): Promise<KitTransaction[]>;
  signAndSendTransactions(params: {
    transactions: KitTransaction[];
  }): Promise<Uint8Array[]>;
}

export type MwaTransact = <T>(
  callback: (wallet: MwaWalletLike) => Promise<T>,
) => Promise<T>;

export interface MobileWalletAdapterOptions {
  transact: MwaTransact;
  identity: MwaAppIdentity;
  /** MWA 2.0 chain id: `solana:mainnet`, `solana:devnet` or `solana:testnet`. */
  chain: "solana:mainnet" | "solana:devnet" | "solana:testnet";
  name?: string;
  icon?: string;
}

const SIGNATURE_LENGTH = 64;

/** Wire transaction → Kit transaction (signatures keyed by signer address). */
export function kitTransactionFromWire(wire: Uint8Array): KitTransaction {
  const tx = parseSolanaTransaction(wire);
  const signatures: Record<string, Uint8Array | null> = {};
  for (let i = 0; i < tx.numRequiredSignatures; i++) {
    const signature = tx.signatures[i] as Uint8Array;
    signatures[tx.accountKeys[i] as string] = signature.some((b) => b !== 0)
      ? signature
      : null;
  }
  return { messageBytes: tx.message, signatures };
}

/** Kit transaction → wire, in the message's signer order. */
export function wireFromKitTransaction(tx: KitTransaction): Uint8Array {
  const count = Object.keys(tx.signatures).length;
  if (count === 0 || count > 127) {
    throw new WalletError("invalid_input", "Unexpected signature count.");
  }
  const unsigned = new Uint8Array(1 + 64 * count + tx.messageBytes.length);
  unsigned[0] = count;
  unsigned.set(tx.messageBytes, 1 + 64 * count);
  const parsed = parseSolanaTransaction(unsigned);
  const out = unsigned.slice();
  parsed.accountKeys.slice(0, parsed.numRequiredSignatures).forEach((k, i) => {
    const signature = tx.signatures[k];
    if (!signature) return;
    if (signature.length !== 64) {
      throw new WalletError(
        "signature_rejected",
        "The wallet returned a malformed signature.",
      );
    }
    out.set(signature, 1 + 64 * i);
  });
  return out;
}

export function createMobileWalletAdapterWallet(
  options: MobileWalletAdapterOptions,
) {
  const { transact, identity, chain } = options;
  let authToken: string | undefined;
  let account: {
    address: string;
    base64: string;
    publicKey: Uint8Array;
  } | null = null;
  const listeners = new Set<(change: unknown) => void>();

  const authorize = async (wallet: MwaWalletLike) => {
    const result = await wallet.authorize({
      identity,
      chain,
      ...(authToken ? { auth_token: authToken } : {}),
    });
    authToken = result.auth_token;
    const first = result.accounts[0];
    if (!first) {
      throw new WalletError(
        "wallet_unavailable",
        "The wallet returned no account.",
      );
    }
    const publicKey = base64Decode(first.address);
    if (publicKey.length !== 32) {
      throw new WalletError(
        "wallet_unavailable",
        "The wallet returned a malformed account.",
      );
    }
    const previous = account?.address;
    account = {
      address: base58Encode(publicKey),
      base64: first.address,
      publicKey,
    };
    // The user may pick another account when the wallet re-authorizes: tell
    // the connector, so the session never shows one account while another
    // signs (as the official wallet-standard-mobile adapter does).
    if (previous !== undefined && previous !== account.address) {
      for (const listener of listeners) {
        listener({ accounts: [standardAccount()] });
      }
    }
    return account;
  };

  const standardAccount = () => {
    if (!account) {
      throw new WalletError("session_expired", "Connect the wallet first.");
    }
    return {
      address: account.address,
      publicKey: account.publicKey,
      chains: [chain],
      features: [
        "solana:signMessage",
        "solana:signTransaction",
        "solana:signAndSendTransaction",
      ],
    };
  };

  return {
    version: "1.0.0" as const,
    name: options.name ?? "Mobile Wallet Adapter",
    icon: options.icon ?? "data:image/svg+xml;base64,",
    chains: [chain],
    get accounts() {
      return account ? [standardAccount()] : [];
    },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          await transact((wallet) => authorize(wallet));
          for (const listener of listeners)
            listener({ accounts: [standardAccount()] });
          return { accounts: [standardAccount()] };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          const token = authToken;
          authToken = undefined;
          account = null;
          for (const listener of listeners) listener({ accounts: [] });
          if (token) {
            await transact((wallet) =>
              wallet.deauthorize({ auth_token: token }),
            ).catch(() => {});
          }
        },
      },
      "standard:events": {
        version: "1.0.0",
        on: (_event: string, listener: (change: unknown) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (message: Uint8Array) =>
          transact(async (wallet) => {
            const { base64 } = await authorize(wallet);
            const [signed] = await wallet.signMessages({
              addresses: [base64],
              payloads: [message],
            });
            if (!signed || signed.length < SIGNATURE_LENGTH) {
              throw new WalletError(
                "signature_rejected",
                "No signature returned.",
              );
            }
            // MWA returns the message with the signature appended.
            return { signature: signed.slice(-SIGNATURE_LENGTH) };
          }),
      },
      "solana:signTransaction": {
        version: "1.0.0",
        signTransaction: async (transaction: Uint8Array) =>
          transact(async (wallet) => {
            await authorize(wallet);
            const [signed] = await wallet.signTransactions({
              transactions: [kitTransactionFromWire(transaction)],
            });
            if (!signed) {
              throw new WalletError(
                "signature_rejected",
                "No transaction returned.",
              );
            }
            return { signedTransaction: wireFromKitTransaction(signed) };
          }),
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        signAndSendTransaction: async (transaction: Uint8Array) =>
          transact(async (wallet) => {
            await authorize(wallet);
            const [signature] = await wallet.signAndSendTransactions({
              transactions: [kitTransactionFromWire(transaction)],
            });
            if (!signature) {
              throw new WalletError("tx_failed", "No signature returned.");
            }
            return { signature: base58Encode(signature) };
          }),
      },
    },
  };
}
