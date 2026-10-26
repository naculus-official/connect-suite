import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRequest } from "../../signing";
import { transactionSigningHash } from "../../signing";
import { MemoryStorageAdapter } from "../../storage";
import {
  delegationSigningDigest,
  type FrameworkExecution,
} from "../delegation-framework";
import { SessionKeyManager } from "../SessionKeyManager";
import { sessionKeyAddress } from "../typed-data";
import type { SessionKeyRail, SessionKeyScope } from "../types";

/**
 * A transaction is signed under a digest derived inside core, and its scope
 * facts are read from the same transaction. The caller never supplies a digest
 * or facts that could describe a different transaction.
 */

const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const SIGNER = "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18" as const;
const RAW_AUTHORIZATION = `0x${"12".repeat(65)}` as const;

function createManager(): SessionKeyManager {
  return new SessionKeyManager(
    {
      defaultExpiryMs: 60_000,
      defaultMaxTxCount: 5,
      defaultMaxTotalValue: 10n ** 18n,
      requireAllowedContracts: false,
      pbkdf2Iterations: 10,
      unsafeAllowWeakKdf: true,
      encryptionKey: "test-key",
    },
    new MemoryStorageAdapter(),
  );
}

function offchainScope(): Partial<SessionKeyScope> {
  return {
    expiry: Math.floor(Date.now() / 1000) + 3600,
    mode: "offchain",
    rails: ["transfer"],
    maxTxCount: 10,
    maxTotalValue: 10n ** 17n, // 0.1 ETH
    allowedContracts: [TOKEN],
    allowedMethods: ["0xa9059cbb"], // transfer(address,uint256)
    allowedChainIds: [1],
  };
}

function erc20Transfer(amount: bigint): `0x${string}` {
  return `0xa9059cbb${"0".repeat(24)}${"11".repeat(20)}${amount.toString(16).padStart(64, "0")}`;
}

function tokenTransferTx(
  overrides: Partial<TransactionRequest> = {},
): TransactionRequest {
  return {
    to: TOKEN,
    value: "0x0",
    data: erc20Transfer(1_000n),
    chainId: 1,
    nonce: "0x1",
    gas: "0x186a0",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x3b9aca00",
    type: "eip1559",
    ...overrides,
  };
}

async function authorizedOffchainKey(
  manager: SessionKeyManager,
  rails: SessionKeyRail[] = ["transfer"],
) {
  const info = await manager.createSessionKey(
    { ...offchainScope(), rails },
    SIGNER,
  );
  await manager.setAuthorization(info.id, {
    signerAddress: SIGNER,
    type: "offchain",
    rawSignature: RAW_AUTHORIZATION,
    message: "test authorization",
  });
  return info;
}

function sign(digest: `0x${string}`, key: Uint8Array): `0x${string}` {
  const sig = secp256k1.sign(hexToBytes(digest.slice(2)), key, {
    prehash: false,
    format: "recovered",
  });
  return `0x${bytesToHex(sig.subarray(1))}${((sig[0] as number) + 27).toString(16)}`;
}

const OWNER_KEY = new Uint8Array(32).fill(0x42);
const OWNER = sessionKeyAddress(
  `0x${bytesToHex(secp256k1.getPublicKey(OWNER_KEY))}`,
);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const PAYEE = "0x2222222222222222222222222222222222222222" as const;

const delegationScope: Partial<SessionKeyScope> = {
  mode: "eip7702",
  rails: ["transfer"],
  allowedContracts: [USDC],
  allowedMethods: ["0xa9059cbb"],
  tokenAllowances: { [USDC]: 1_000n },
  allowedRecipients: [PAYEE],
  allowedChainIds: [8453],
};

function transferExecution(to: string, amount: bigint): FrameworkExecution {
  return {
    target: USDC,
    value: 0n,
    callData: `0xa9059cbb${to.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`,
  };
}

async function delegatedKey() {
  const manager = new SessionKeyManager(
    { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
    new MemoryStorageAdapter(),
  );
  const info = await manager.createSessionKey(delegationScope, OWNER);
  const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
  await manager.attachDelegation(
    info.id,
    delegation,
    sign(delegationSigningDigest(delegation), OWNER_KEY),
  );
  return { manager, info };
}

describe("signTransactionWithSessionKey", () => {
  it("signs the transaction digest with the session key", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);
    const tx = tokenTransferTx();

    const signature = await manager.signTransactionWithSessionKey(info.id, tx);

    // Recover the signer from the digest of this exact transaction: it must
    // be the session key. The digest is checked without any raw-digest API.
    const digest = bytesToHex(transactionSigningHash(tx));
    const sig = hexToBytes(signature.slice(2));
    const recovered = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact")
      .addRecoveryBit((sig[64] as number) - 27)
      .recoverPublicKey(hexToBytes(digest));
    expect(signature).toMatch(/^0x[0-9a-f]{130}$/);
    expect(sessionKeyAddress(`0x${recovered.toHex(true)}`)).toBe(
      sessionKeyAddress(info.publicKey),
    );
  });

  it("signs a transaction for a transfer-only key with rails in scope", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);

    await expect(
      manager.signTransactionWithSessionKey(info.id, tokenTransferTx()),
    ).resolves.toMatch(/^0x[0-9a-f]{130}$/);
  });

  it.each(["x402-exact", "mpp-charge"] as const)(
    "refuses a plain transaction for a %s-only key (default-deny)",
    async (rail) => {
      const manager = createManager();
      const info = await authorizedOffchainKey(manager, [rail]);

      await expect(
        manager.signTransactionWithSessionKey(info.id, tokenTransferTx()),
      ).rejects.toMatchObject({
        code: "session_key_scope_exceeded",
        details: "A transaction needs the transfer rail in the session scope",
      });
      expect(
        (await manager.listSessions()).find((item) => item.id === info.id)
          ?.useCount,
      ).toBe(0);
    },
  );

  it("refuses a plain transaction for an eip7702 key", async () => {
    const { manager, info } = await delegatedKey();

    await expect(
      manager.signTransactionWithSessionKey(info.id, tokenTransferTx()),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details: expect.stringMatching(/signTransactionDelegationRedemption/),
    });
  });

  it.each([
    { type: "eip7702" as const, authorizationList: undefined },
    { type: "eip1559" as const, authorizationList: [type4Authorization()] },
  ])(
    "refuses a type-4 transaction for a transfer-only non-eip7702 key before signing (type $type, authorizationList $authorizationList)",
    async ({ type, authorizationList }) => {
      const manager = createManager();
      const info = await authorizedOffchainKey(manager, ["transfer"]);
      const signing = spySigning(manager);

      await expect(
        manager.signTransactionWithSessionKey(
          info.id,
          tokenTransferTx({ type, authorizationList }),
        ),
      ).rejects.toMatchObject({
        code: "session_key_scope_exceeded",
        details:
          "A plain session transaction cannot be an EIP-7702 transaction; delegation redemptions use signTransactionDelegationRedemption.",
      });
      expect(signing).not.toHaveBeenCalled();
      expect(
        (await manager.listSessions()).find((item) => item.id === info.id)
          ?.useCount,
      ).toBe(0);
    },
  );

  it("refuses a type-2 transaction with an empty authorizationList for a transfer-only key before signing", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);
    const signing = spySigning(manager);

    await expect(
      manager.signTransactionWithSessionKey(
        info.id,
        tokenTransferTx({ type: "eip1559", authorizationList: [] }),
      ),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details:
        "A plain session transaction cannot be an EIP-7702 transaction; delegation redemptions use signTransactionDelegationRedemption.",
    });
    expect(signing).not.toHaveBeenCalled();
  });

  it("refuses a transaction whose recipient is outside the scope", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);

    await expect(
      manager.signTransactionWithSessionKey(
        info.id,
        tokenTransferTx({ to: OTHER }),
      ),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
  });

  it("refuses a transaction whose value is outside the scope", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);

    await expect(
      manager.signTransactionWithSessionKey(
        info.id,
        tokenTransferTx({ value: `0x${(10n ** 18n).toString(16)}` }),
      ),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    expect(
      (await manager.listSessions()).find((item) => item.id === info.id)
        ?.useCount,
    ).toBe(0);
  });

  it("refuses a transaction it cannot hash", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);

    await expect(
      manager.signTransactionWithSessionKey(
        info.id,
        tokenTransferTx({ chainId: undefined }),
      ),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
  });
});

describe("signTransactionWithVerifiedOffchainAuthorization", () => {
  const expectedMessage = "test authorization";

  it("signs the transaction digest after the off-chain authorization verifies", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);
    const tx = tokenTransferTx();
    const verify = vi.fn(() => true);

    const signature =
      await manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => expectedMessage,
        verify,
        tx,
      );

    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expectedMessage }),
    );
    const digest = bytesToHex(transactionSigningHash(tx));
    const sig = hexToBytes(signature.slice(2));
    const recovered = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact")
      .addRecoveryBit((sig[64] as number) - 27)
      .recoverPublicKey(hexToBytes(digest));
    expect(sessionKeyAddress(`0x${recovered.toHex(true)}`)).toBe(
      sessionKeyAddress(info.publicKey),
    );
  });

  it("refuses a transaction whose recipient is outside the scope", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);

    await expect(
      manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => expectedMessage,
        () => true,
        tokenTransferTx({ to: OTHER }),
      ),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    expect(
      (await manager.listSessions()).find((item) => item.id === info.id)
        ?.useCount,
    ).toBe(0);
  });

  it("refuses a type-4 transaction before verifying or signing", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);
    const verify = vi.fn(() => true);
    const signing = spySigning(manager);

    await expect(
      manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => expectedMessage,
        verify,
        tokenTransferTx({
          type: "eip7702",
          authorizationList: [type4Authorization()],
        }),
      ),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details:
        "A plain session transaction cannot be an EIP-7702 transaction; delegation redemptions use signTransactionDelegationRedemption.",
    });
    expect(verify).not.toHaveBeenCalled();
    expect(signing).not.toHaveBeenCalled();
  });

  it("refuses an eip1559 transaction with a non-empty authorizationList before verifying or signing", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);
    const verify = vi.fn(() => true);
    const signing = spySigning(manager);

    await expect(
      manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => expectedMessage,
        verify,
        tokenTransferTx({
          type: "eip1559",
          authorizationList: [type4Authorization()],
        }),
      ),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details:
        "A plain session transaction cannot be an EIP-7702 transaction; delegation redemptions use signTransactionDelegationRedemption.",
    });
    expect(verify).not.toHaveBeenCalled();
    expect(signing).not.toHaveBeenCalled();
  });

  it("refuses when the off-chain authorization fails verification", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);

    await expect(
      manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => expectedMessage,
        () => false,
        tokenTransferTx(),
      ),
    ).rejects.toMatchObject({
      code: "session_key_invalid_input",
      details: "Off-chain authorization no longer matches the signed policy",
    });
    expect(
      (await manager.listSessions()).find((item) => item.id === info.id)
        ?.useCount,
    ).toBe(0);
  });

  it("refuses when the expected message no longer matches the stored policy", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager);
    const verify = vi.fn(() => true);

    await expect(
      manager.signTransactionWithVerifiedOffchainAuthorization(
        info.id,
        () => "a different policy",
        verify,
        tokenTransferTx(),
      ),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
    expect(verify).not.toHaveBeenCalled();
  });
});

describe("raw-digest methods are refused for every key with rails", () => {
  const digest = `0x${"ab".repeat(32)}` as const;
  const refusal = {
    code: "session_key_scope_exceeded",
    details: expect.stringContaining(
      "A raw digest cannot be bound to the transaction it signs",
    ),
  };

  it("refuses signWithSessionKey for a transfer-only key", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);

    await expect(
      manager.signWithSessionKey(info.id, digest, { to: TOKEN }),
    ).rejects.toMatchObject(refusal);
  });

  it("refuses signWithVerifiedOffchainAuthorization for a transfer-only key", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);

    await expect(
      manager.signWithVerifiedOffchainAuthorization(
        info.id,
        () => "test authorization",
        () => true,
        digest,
        { to: TOKEN },
      ),
    ).rejects.toMatchObject(refusal);
  });

  it("refuses signDelegationRedemption for a transfer-only key", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);

    await expect(
      manager.signDelegationRedemption(
        info.id,
        digest,
        { chainId: 1, to: OTHER, value: "0", data: "0x" },
        { target: TOKEN, value: 0n, callData: "0x" },
      ),
    ).rejects.toMatchObject(refusal);
  });

  it("refuses getSessionBundle for a transfer-only key", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);

    await expect(manager.getSessionBundle(info.id)).rejects.toMatchObject(
      refusal,
    );
  });

  it("refuses the raw digest for an x402-only key as well", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["x402-exact"]);

    await expect(
      manager.signWithSessionKey(info.id, digest, { to: TOKEN }),
    ).rejects.toMatchObject(refusal);
  });
});

describe("signTransactionDelegationRedemption", () => {
  it("signs the redemption transaction for its execution", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transferExecution(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const tx = redemptionTx(call);

    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        tx,
        { gas: tx.gas },
        execution,
      ),
    ).resolves.toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("refuses a transaction that is not the redemption for the execution", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transferExecution(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const other = await manager.buildDelegationRedemption(
      info.id,
      transferExecution(PAYEE, 2n),
    );
    const tx = redemptionTx(call);

    for (const wrong of [
      { ...tx, to: OTHER },
      { ...tx, value: "0x1" },
      { ...tx, chainId: 1 },
      { ...tx, data: other.data },
    ]) {
      await expect(
        manager.signTransactionDelegationRedemption(
          info.id,
          wrong,
          { gas: wrong.gas },
          execution,
        ),
      ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    }
  });

  it("refuses a type-4 outer redemption transaction before signing", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transferExecution(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const tx = redemptionTx(call);
    const signing = spySigning(manager);

    for (const wrong of [
      { ...tx, type: "eip7702" as const },
      { ...tx, authorizationList: [type4Authorization()] },
    ]) {
      await expect(
        manager.signTransactionDelegationRedemption(
          info.id,
          wrong,
          { gas: wrong.gas },
          execution,
        ),
      ).rejects.toMatchObject({
        code: "session_key_scope_exceeded",
        details:
          "The redemption transaction must not carry an EIP-7702 authorization list.",
      });
    }
    expect(signing).not.toHaveBeenCalled();
  });

  it("refuses an outer eip7702 transaction for a transfer-only non-eip7702 key before signing", async () => {
    const manager = createManager();
    const info = await authorizedOffchainKey(manager, ["transfer"]);
    const execution = transferExecution(PAYEE, 1n);
    const tx = { ...tokenTransferTx(), type: "eip7702" as const };
    const signing = spySigning(manager);

    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        tx,
        { gas: tx.gas },
        execution,
      ),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details:
        "The redemption transaction must not carry an EIP-7702 authorization list.",
    });
    expect(signing).not.toHaveBeenCalled();
  });

  it("refuses an outer gas that differs from the transaction's gas", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transferExecution(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const tx = redemptionTx(call);

    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        tx,
        { gas: "0x1" },
        execution,
      ),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
  });
});

function type4Authorization() {
  return {
    chainId: 8453,
    address: OTHER,
    nonce: "0x0",
    yParity: 0 as const,
    r: `0x${"11".repeat(32)}` as const,
    s: `0x${"22".repeat(32)}` as const,
  };
}

/** Spies on the signing routine: a refusal must happen before any signature. */
function spySigning(manager: SessionKeyManager) {
  return vi.spyOn(
    manager as unknown as { signStoredSessionKey: () => Promise<unknown> },
    "signStoredSessionKey",
  );
}

function redemptionTx(call: {
  to: string;
  value: string;
  chainId: number;
  data: string;
}): TransactionRequest {
  return {
    to: call.to,
    value: call.value,
    data: call.data,
    chainId: call.chainId,
    nonce: "0x0",
    gas: "0x30d40",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x3b9aca00",
    type: "eip1559",
  };
}
