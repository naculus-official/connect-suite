import {
  MemoryStorageAdapter,
  parseSolanaTransaction,
  SOLANA_MAINNET,
  SOLANA_PROGRAMS,
  type SolanaPaymentRpc,
  SolanaSessionKeyManager,
} from "@naculus/connect-core";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

/** Test fixtures shared by the Solana session key shell tests. */
const TEST_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TEST_PAY_TO = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const SEED = new Uint8Array(32).fill(7);

export function testSolanaDeps(options: { decline?: boolean } = {}) {
  const mint = new Uint8Array(82);
  mint[44] = 6;
  mint[45] = 1;
  const rpc: SolanaPaymentRpc = {
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getLatestBlockhash: async () =>
      "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
    getAccountInfo: async (a) =>
      a === TEST_USDC ? { owner: SOLANA_PROGRAMS.token, data: mint } : null,
    sendTransaction: async () => "sig",
  };
  const owner = {
    address: base58.encode(ed25519.getPublicKey(SEED)),
    signTransaction: async (wire: Uint8Array) => {
      if (options.decline) throw new Error("user_rejected");
      const tx = parseSolanaTransaction(wire);
      const out = wire.slice();
      out.set(ed25519.sign(tx.message, SEED), 1);
      return out;
    },
  };
  const manager = new SolanaSessionKeyManager(
    { encryptionKey: "k", pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true },
    new MemoryStorageAdapter(),
  );
  return { manager, rpc, owner };
}

export const testSolanaScope = () => ({
  cluster: SOLANA_MAINNET,
  mint: TEST_USDC,
  budget: 1_000n,
  maxPerPayment: 400n,
  allowedRecipients: [TEST_PAY_TO],
  expiry: Math.floor(Date.now() / 1000) + 3600,
});
