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
import { describe, expect, it, vi } from "vitest";
import {
  createSolanaSessionKeyFlow,
  type SolanaOwnerSigner,
} from "./solana-session-key";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAY_TO = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const SEED = new Uint8Array(32).fill(7);
const OWNER = base58.encode(ed25519.getPublicKey(SEED));

function rpc(sent: string[] = []): SolanaPaymentRpc {
  const mint = new Uint8Array(82);
  mint[44] = 6;
  mint[45] = 1;
  return {
    getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getLatestBlockhash: async () => BLOCKHASH,
    getAccountInfo: async (a) =>
      a === USDC ? { owner: SOLANA_PROGRAMS.token, data: mint } : null,
    sendTransaction: async (tx) => {
      sent.push(tx);
      return `sig${sent.length}`;
    },
  };
}

const wallet = {
  address: OWNER,
  signTransaction: vi.fn(async (wire: Uint8Array) => {
    const tx = parseSolanaTransaction(wire);
    const out = wire.slice();
    out.set(ed25519.sign(tx.message, SEED), 1);
    return out;
  }),
};

const scope = () => ({
  cluster: SOLANA_MAINNET,
  mint: USDC,
  budget: 1_000n,
  maxPerPayment: 400n,
  allowedRecipients: [PAY_TO],
  expiry: Math.floor(Date.now() / 1000) + 3600,
});

function flow(
  overrides: { owner?: SolanaOwnerSigner; rpc?: SolanaPaymentRpc } = {},
) {
  const manager = new SolanaSessionKeyManager(
    { encryptionKey: "k", pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true },
    new MemoryStorageAdapter(),
  );
  const sent: string[] = [];
  return {
    manager,
    sent,
    flow: createSolanaSessionKeyFlow({
      manager,
      rpc: overrides.rpc ?? rpc(sent),
      owner: overrides.owner ?? wallet,
    }),
  };
}

describe("createSolanaSessionKeyFlow", () => {
  it("creates, approves and broadcasts; the key is active", async () => {
    const { flow: f, sent } = flow();
    const { key, signature } = await f.create(scope());
    expect(signature).toBe("sig1");
    expect(sent).toHaveLength(1);
    expect(key.status).toBe("active");
    expect((await f.list()).map((k) => k.id)).toEqual([key.id]);
  });

  it("revokes the draft when the wallet declines the approval", async () => {
    const declining = {
      address: OWNER,
      signTransaction: async () => {
        throw new Error("user_rejected");
      },
    };
    const { flow: f, sent } = flow({ owner: declining });
    await expect(f.create(scope())).rejects.toThrow("user_rejected");
    expect(sent).toEqual([]);
    expect((await f.list())[0]?.status).toBe("revoked");
  });

  it("keeps a broadcast approval even if reading the keys fails afterwards", async () => {
    const { flow: f, manager } = flow();
    const listSessions = manager.listSessions.bind(manager);
    let calls = 0;
    manager.listSessions = async () => {
      // createSessionKey and the approval read through loadAll, not this.
      calls++;
      if (calls >= 1) throw new Error("storage read failed");
      return listSessions();
    };
    const { key, signature } = await f.create(scope());
    expect(signature).toBe("sig1");
    expect(key.status).toBe("active");
    manager.listSessions = listSessions;
    expect((await f.list())[0]?.status).toBe("active");
  });

  it("revokes the key when the approval cannot be confirmed as sent", async () => {
    const failing = {
      ...rpc(),
      sendTransaction: async () => {
        throw new Error("rpc down");
      },
    };
    const { flow: f, manager } = flow({ rpc: failing });
    await expect(f.create(scope())).rejects.toThrow(
      /could not be confirmed as sent \(rpc down\).*revoke\(/,
    );
    const [key] = await f.list();
    expect(key?.status).toBe("revoked");
    // revoke() still sends the on-chain Revoke for the locally revoked key.
    const sent: string[] = [];
    const retry = createSolanaSessionKeyFlow({
      manager,
      rpc: rpc(sent),
      owner: wallet,
    });
    await expect(retry.revoke(key!.id)).resolves.toEqual({ signature: "sig1" });
    expect(sent).toHaveLength(1);
  });

  it("revokes locally at once, then broadcasts the owner's Revoke", async () => {
    const { flow: f, sent } = flow();
    const { key } = await f.create(scope());
    await expect(f.revoke(key.id)).resolves.toEqual({ signature: "sig2" });
    expect(sent).toHaveLength(2);
    expect((await f.list())[0]?.status).toBe("revoked");
  });

  it("needs an RPC that can send", async () => {
    const { sendTransaction: _s, ...readOnly } = rpc();
    const { flow: f } = flow({ rpc: readOnly });
    await expect(f.create(scope())).rejects.toThrow(/sendTransaction/);
  });

  it("lists only the connected owner's keys", async () => {
    const { flow: f, manager } = flow();
    await f.create(scope());
    const other = createSolanaSessionKeyFlow({
      manager,
      rpc: rpc(),
      owner: { ...wallet, address: PAY_TO },
    });
    expect(await other.list()).toEqual([]);
  });
});
