import {
  type SolanaPaymentRpc,
  type SolanaSessionKeyInfo,
  type SolanaSessionKeyManager,
  type SolanaSessionKeyScope,
  verifySignedOwnerTransaction,
  WalletError,
} from "@naculus/connect-core";

/**
 * Solana session keys for the appkit shells (connect-lib STATE thread 18).
 *
 * The app builds the `SolanaSessionKeyManager` (its storage and password) and
 * the RPC; the owner is the connected wallet's Solana signer role. Creating a
 * key asks the wallet once to sign an SPL `ApproveChecked` (the key becomes
 * the delegate of the owner's token account for that mint, up to the budget)
 * and broadcasts it; revoking asks it to sign `Revoke`. Payments then go
 * through `createX402Fetch` / `createMppFetch` with
 * `solana: { sessionKey: { manager, id }, rpc }` — no prompt.
 */

export interface SolanaOwnerSigner {
  address: string;
  signTransaction(transaction: Uint8Array): Promise<Uint8Array>;
}

export interface SolanaSessionKeyFlowDeps {
  manager: SolanaSessionKeyManager;
  /** Must implement `sendTransaction` (e.g. `solanaPaymentRpc(url)`). */
  rpc: SolanaPaymentRpc;
  owner: SolanaOwnerSigner;
}

export interface SolanaSessionKeyFlow {
  /** The owner's keys, newest first. */
  list(): Promise<SolanaSessionKeyInfo[]>;
  /**
   * Create a key, have the owner approve it, broadcast the approval.
   * Approving replaces any delegate the owner's token account already had.
   *
   * On any failure the new key is revoked here, so it never signs. A failed
   * broadcast does not prove the approval did not land (a timeout after
   * submission): the error then says so, and `revoke(id)` sends the owner's
   * on-chain `Revoke` to be sure.
   */
  create(
    scope: SolanaSessionKeyScope,
  ): Promise<{ key: SolanaSessionKeyInfo; signature: string }>;
  /**
   * Stop the key here at once (before anything else can fail), then have the
   * owner sign `Revoke` and broadcast it. If that fails, the key stays
   * revoked locally; the on-chain delegate stays until a later revoke lands.
   * Also works on a key already revoked locally.
   */
  revoke(id: string): Promise<{ signature: string }>;
}

function send(rpc: SolanaPaymentRpc): (tx: string) => Promise<string> {
  const sendTransaction = rpc.sendTransaction;
  if (!sendTransaction) {
    throw new WalletError(
      "invalid_input",
      "The Solana RPC must implement sendTransaction to approve or revoke.",
    );
  }
  return (tx) => sendTransaction.call(rpc, tx);
}

export function createSolanaSessionKeyFlow(
  deps: SolanaSessionKeyFlowDeps,
): SolanaSessionKeyFlow {
  const { manager, rpc, owner } = deps;

  const list = async () =>
    (await manager.listSessions())
      .filter((key) => key.owner === owner.address)
      .sort((a, b) => b.createdAt - a.createdAt);

  return {
    list,

    async create(scope) {
      const broadcast = send(rpc);
      const draft = await manager.createSessionKey(scope, owner.address, rpc);
      let approval: string;
      try {
        const { transaction, recentBlockhash } = await manager.prepareApproval(
          draft.id,
          rpc,
        );
        const signed = await owner.signTransaction(transaction);
        approval = await manager.attachApproval(
          draft.id,
          signed,
          recentBlockhash,
        );
      } catch (cause) {
        // Nothing was broadcast: the key was never approved on chain.
        await manager.revoke(draft.id).catch(() => {});
        throw cause;
      }
      let signature: string;
      try {
        signature = await broadcast(approval);
      } catch (cause) {
        await manager.revoke(draft.id).catch(() => {});
        throw new WalletError(
          "rpc_error",
          `The approval could not be confirmed as sent (${
            cause instanceof Error ? cause.message : String(cause)
          }); the key is revoked here. Call revoke("${draft.id}") to send the ` +
            "on-chain Revoke in case it landed.",
        );
      }
      // The key is live on chain now: a failed read must not undo that.
      const key = (await list().catch(() => [])).find((k) => k.id === draft.id);
      return { key: key ?? { ...draft, status: "active" }, signature };
    },

    async revoke(id) {
      const key = (await list()).find((k) => k.id === id);
      if (!key) {
        throw new WalletError(
          "invalid_input",
          `No Solana session key ${id} for this owner.`,
        );
      }
      await manager.revoke(id);
      const broadcast = send(rpc);
      const { transaction, recentBlockhash } = await manager.prepareRevocation(
        id,
        rpc,
      );
      const signed = await owner.signTransaction(transaction);
      const revocation = verifySignedOwnerTransaction(signed, {
        kind: "revoke",
        revocation: {
          owner: key.owner,
          mint: key.scope.mint,
          tokenProgram: key.tokenProgram,
          recentBlockhash,
        },
      });
      return { signature: await broadcast(revocation) };
    },
  };
}
