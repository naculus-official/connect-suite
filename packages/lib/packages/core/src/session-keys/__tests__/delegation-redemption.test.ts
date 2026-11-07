import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionRequest } from "../../signing";
import { MemoryStorageAdapter } from "../../storage";
import {
  DELEGATION_FRAMEWORK,
  delegationSigningDigest,
  encodePermissionContext,
  encodeRedeemDelegations,
  type FrameworkExecution,
} from "../delegation-framework";
import { SessionKeyManager } from "../SessionKeyManager";
import { sessionKeyAddress } from "../typed-data";
import type { SessionKeyScope } from "../types";

/**
 * Thread 17 package 2: an eip7702 session key is authorized by the owner's
 * signed delegation and signs only its redemptions (encoding checked against
 * @metamask/delegation-core and viem in delegation-framework.test.ts).
 */

const OWNER_KEY = new Uint8Array(32).fill(0x42);
const OWNER = sessionKeyAddress(
  `0x${bytesToHex(secp256k1.getPublicKey(OWNER_KEY))}`,
);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const PAYEE = "0x2222222222222222222222222222222222222222" as const;
const OTHER = "0x3333333333333333333333333333333333333333" as const;
const DIGEST = `0x${"ab".repeat(32)}` as const;

const scope: Partial<SessionKeyScope> = {
  mode: "eip7702",
  rails: ["transfer"],
  allowedContracts: [USDC],
  allowedMethods: ["0xa9059cbb"],
  tokenAllowances: { [USDC]: 1_000n },
  allowedRecipients: [PAYEE],
  allowedChainIds: [8453],
};

function sign(digest: `0x${string}`, key = OWNER_KEY): `0x${string}` {
  const sig = secp256k1.sign(hexToBytes(digest.slice(2)), key, {
    prehash: false,
    format: "recovered",
  });
  return `0x${bytesToHex(sig.subarray(1))}${((sig[0] as number) + 27).toString(16)}`;
}

function transfer(to: string, amount: bigint): FrameworkExecution {
  return {
    target: USDC,
    value: 0n,
    callData: `0xa9059cbb${to.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`,
  };
}

/** The redemption transaction a built call describes, as the wallet sends it. */
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

async function delegatedKey() {
  const manager = new SessionKeyManager(
    { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
    new MemoryStorageAdapter(),
  );
  const info = await manager.createSessionKey(scope, OWNER);
  const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
  await manager.attachDelegation(
    info.id,
    delegation,
    sign(delegationSigningDigest(delegation)),
  );
  return { manager, info, delegation };
}

describe("eip7702 session keys: attaching the delegation", () => {
  it("attaches the owner's signed delegation as the key's authorization", async () => {
    const { manager, info, delegation } = await delegatedKey();
    expect(delegation.delegator).toBe(OWNER.toLowerCase());
    expect(delegation.delegate).toBe(sessionKeyAddress(info.publicKey));
    const listed = (await manager.listSessions()).find((s) => s.id === info.id);
    expect(listed?.authorized).toBe(true);
  });

  it("refuses a signature from anyone but the owner", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(scope, OWNER);
    const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
    const digest = delegationSigningDigest(delegation);
    const valid = sign(digest);
    const s = BigInt(`0x${valid.slice(66, 130)}`);
    const n = secp256k1.Point.CURVE().n;
    const highS =
      `0x${valid.slice(2, 66)}${(n - s).toString(16).padStart(64, "0")}${valid.slice(130) === "1b" ? "1c" : "1b"}` as `0x${string}`;
    for (const bad of [
      sign(digest, new Uint8Array(32).fill(0x43)),
      highS,
      `${valid.slice(0, 130)}00` as `0x${string}`,
      "0x1234" as `0x${string}`,
    ]) {
      await expect(
        manager.attachDelegation(info.id, delegation, bad),
      ).rejects.toMatchObject({ code: "session_key_invalid_input" });
    }
  });

  it("refuses a delegation that is not the one built for this scope", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(scope, OWNER);
    const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
    // A looser caveat set, signed by the real owner.
    const looser = {
      ...delegation,
      caveats: delegation.caveats.slice(0, 3),
    };
    await expect(
      manager.attachDelegation(
        info.id,
        looser,
        sign(delegationSigningDigest(looser)),
      ),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
  });

  it("no longer accepts unverified eip7702 bytes through setAuthorization", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(scope, OWNER);
    await expect(
      manager.setAuthorization(info.id, {
        type: "eip7702",
        signerAddress: OWNER,
        authorization: "0x1234",
      }),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
  });

  it("refuses a delegation for a chain outside the scope", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(scope, OWNER);
    await expect(manager.prepareDelegation(info.id, 1)).rejects.toMatchObject({
      code: "session_key_invalid_input",
    });
  });
});

describe("eip7702 session keys: redemption", () => {
  it("builds the redemption of the stored delegation", async () => {
    const { manager, info, delegation } = await delegatedKey();
    const execution = transfer(PAYEE, 400n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const signed = {
      ...delegation,
      signature: sign(delegationSigningDigest(delegation)),
    };
    expect(call).toEqual({
      to: DELEGATION_FRAMEWORK.delegationManager,
      value: "0x0",
      chainId: 8453,
      data: encodeRedeemDelegations(signed, execution),
    });
    expect(encodePermissionContext([signed])).toMatch(/^0x/);
  });

  it("signs the redemption and accounts the token spend", async () => {
    const { manager, info } = await delegatedKey();
    const first = transfer(PAYEE, 600n);
    const call = await manager.buildDelegationRedemption(info.id, first);
    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        redemptionTx(call),
        {},
        first,
      ),
    ).resolves.toMatch(/^0x[0-9a-f]{130}$/);
    // 600 + 600 exceeds the 1000 allowance, checked before signing.
    const second = transfer(PAYEE, 600n);
    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        redemptionTx(await manager.buildDelegationRedemption(info.id, second)),
        {},
        second,
      ),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
  });

  it("refuses a transaction that is not this key's redemption", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transfer(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    const other = await manager.buildDelegationRedemption(
      info.id,
      transfer(PAYEE, 2n),
    );
    for (const outer of [
      { ...call, to: OTHER },
      { ...call, value: "0x1" },
      { ...call, chainId: 1 },
      { ...call, data: other.data },
    ]) {
      await expect(
        manager.signTransactionDelegationRedemption(
          info.id,
          redemptionTx(outer),
          {},
          execution,
        ),
      ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    }
  });

  it("refuses an execution outside the scope", async () => {
    const { manager, info } = await delegatedKey();
    const execution = transfer(OTHER, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    await expect(
      manager.signTransactionDelegationRedemption(
        info.id,
        redemptionTx(call),
        {},
        execution,
      ),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
  });

  it("signs nothing else with an eip7702 key", async () => {
    const { manager, info } = await delegatedKey();
    // The raw-digest redemption method is refused for every rails key, even
    // for the redemption itself; only the bound method signs redemptions.
    const execution = transfer(PAYEE, 1n);
    const call = await manager.buildDelegationRedemption(info.id, execution);
    await expect(
      manager.signDelegationRedemption(info.id, DIGEST, call, execution),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    await expect(
      manager.signWithSessionKey(info.id, DIGEST, { to: USDC }),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
    await expect(manager.getSessionBundle(info.id)).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
    });
    await expect(
      manager.signTransactionWithSessionKey(info.id, redemptionTx(call)),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
  });

  it("refuses other signing for an eip7702 key even without a recipient limit", async () => {
    // Without allowedRecipients the older recipient guard does not fire, so
    // this exercises the eip7702 refusal itself.
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(
      {
        mode: "eip7702",
        rails: ["transfer"],
        allowedContracts: [PAYEE],
        allowedMethods: ["0x12345678"],
        maxTotalValue: 10n ** 15n,
      },
      OWNER,
    );
    const delegation = await manager.prepareDelegation(info.id, 8453, 2n);
    await manager.attachDelegation(
      info.id,
      delegation,
      sign(delegationSigningDigest(delegation)),
    );
    await expect(
      manager.signWithSessionKey(info.id, DIGEST, { to: PAYEE, value: "1" }),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details: expect.stringMatching(/only delegation redemptions/),
    });
    await expect(manager.getSessionBundle(info.id)).rejects.toMatchObject({
      details: expect.stringMatching(/only delegation redemptions/),
    });
    await expect(
      manager.signTypedDataWithSessionKey(
        info.id,
        {
          domain: {
            name: "USD Coin",
            version: "2",
            chainId: 8453,
            verifyingContract: USDC,
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from: sessionKeyAddress(info.publicKey),
            to: PAYEE,
            value: "1",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 600),
            nonce: `0x${"ab".repeat(32)}`,
          },
        },
        "x402-exact",
      ),
    ).rejects.toMatchObject({
      details: expect.stringMatching(/only delegation redemptions/),
    });
  });
});

describe("eip7702 session keys: period windows follow chain time", () => {
  const START = 1_000_000;
  const period = { amount: 500n, seconds: 100, start: START };

  async function periodKey() {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(
      { ...scope, periodLimits: { [USDC]: period } },
      OWNER,
    );
    const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
    await manager.attachDelegation(
      info.id,
      delegation,
      sign(delegationSigningDigest(delegation)),
    );
    return { manager, info };
  }

  async function redeem(
    manager: SessionKeyManager,
    id: string,
    amount: bigint,
    chainTime?: { timestamp: number; inclusionMarginSeconds: number },
  ) {
    const execution = transfer(PAYEE, amount);
    const call = await manager.buildDelegationRedemption(id, execution);
    return manager.signTransactionDelegationRedemption(
      id,
      redemptionTx(call),
      {},
      execution,
      chainTime,
    );
  }

  it("refuses a period-limited redemption without chain time", async () => {
    const { manager, info } = await periodKey();
    await expect(redeem(manager, info.id, 1n)).rejects.toMatchObject({
      code: "session_key_invalid_input",
    });
  });

  it("counts the window from chain time, not the device clock", async () => {
    const { manager, info } = await periodKey();
    // The device clock is far past START; chain time is in window 0.
    await expect(
      redeem(manager, info.id, 500n, {
        timestamp: START + 10,
        inclusionMarginSeconds: 12,
      }),
    ).resolves.toMatch(/^0x/);
    await expect(
      redeem(manager, info.id, 1n, {
        timestamp: START + 20,
        inclusionMarginSeconds: 12,
      }),
    ).rejects.toMatchObject({ code: "session_key_scope_exceeded" });
  });

  it("refuses a redemption that could land in the next window", async () => {
    const { manager, info } = await periodKey();
    await expect(
      redeem(manager, info.id, 1n, {
        timestamp: START + 90,
        inclusionMarginSeconds: 12,
      }),
    ).rejects.toMatchObject({
      code: "session_key_scope_exceeded",
      details: expect.stringMatching(/next period/),
    });
    // Past the boundary the new window opens with nothing spent.
    await expect(
      redeem(manager, info.id, 500n, {
        timestamp: START + 100,
        inclusionMarginSeconds: 12,
      }),
    ).resolves.toMatch(/^0x/);
  });

  describe("chain time ahead of the device clock", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function freezeClock(): number {
      const nowSec = Math.floor(Date.now() / 1000);
      vi.spyOn(Date, "now").mockReturnValue(nowSec * 1000);
      return nowSec;
    }

    it("refuses a timestamp more than one period ahead and records nothing", async () => {
      const { manager, info } = await periodKey();
      const nowSec = freezeClock();
      await expect(
        redeem(manager, info.id, 500n, {
          timestamp: nowSec + period.seconds + 1,
          inclusionMarginSeconds: 12,
        }),
      ).rejects.toMatchObject({
        code: "session_key_invalid_input",
        details: expect.stringMatching(/ahead of the device clock/),
      });
      // Nothing was recorded: the full limit is still available at real time,
      // and no future period index blocks signing as malformed.
      await expect(
        redeem(manager, info.id, 500n, {
          timestamp: nowSec - ((nowSec - START) % period.seconds),
          inclusionMarginSeconds: 12,
        }),
      ).resolves.toMatch(/^0x/);
    });

    it("accepts a timestamp inside the allowed skew", async () => {
      const { manager, info } = await periodKey();
      const nowSec = freezeClock();
      // Exactly one period ahead, at the start of a window.
      const ahead = nowSec + period.seconds;
      await expect(
        redeem(manager, info.id, 1n, {
          timestamp: ahead - ((ahead - START) % period.seconds),
          inclusionMarginSeconds: 12,
        }),
      ).resolves.toMatch(/^0x/);
    });
  });
});

describe("eip7702 session keys: parallel redemptions cannot overspend a period", () => {
  const START = 1_000_000;
  const period = { amount: 500n, seconds: 100, start: START };

  it("accepts exactly the amount that fits when many redemptions race", async () => {
    const manager = new SessionKeyManager(
      { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true, encryptionKey: "k" },
      new MemoryStorageAdapter(),
    );
    const info = await manager.createSessionKey(
      { ...scope, periodLimits: { [USDC]: period } },
      OWNER,
    );
    const delegation = await manager.prepareDelegation(info.id, 8453, 1n);
    await manager.attachDelegation(
      info.id,
      delegation,
      sign(delegationSigningDigest(delegation)),
    );
    const chainTime = { timestamp: START + 10, inclusionMarginSeconds: 12 };
    const attempts = Array.from({ length: 10 }, async () => {
      const execution = transfer(PAYEE, 100n);
      const call = await manager.buildDelegationRedemption(info.id, execution);
      return manager.signTransactionDelegationRedemption(
        info.id,
        redemptionTx(call),
        {},
        execution,
        chainTime,
      );
    });
    const results = await Promise.allSettled(attempts);
    const accepted = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    // 500 allows exactly five 100-unit redemptions in one window.
    expect(accepted).toHaveLength(5);
    expect(refused).toHaveLength(5);
    for (const r of refused) {
      expect(r.reason).toMatchObject({ code: "session_key_scope_exceeded" });
    }
  });
});
