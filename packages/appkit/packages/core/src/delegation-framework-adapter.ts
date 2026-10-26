import {
  DELEGATION_FRAMEWORK,
  type FrameworkExecution,
  type SessionKeyManager,
  sessionKeyAddress,
  WalletError,
} from "@naculus/connect-core";
import type {
  PolicyExecutionAdapter,
  PreparedPolicyExecution,
} from "./delegation-policy";

/**
 * The execution adapter for `eip7702` policies (MetaMask Delegation Framework
 * v1.3.0; docs/design/eip7702-session-delegation.md in connect-lib).
 *
 * The session key sends `DelegationManager.redeemDelegations` from its own
 * address and pays the gas; the chain enforces the delegation's caveats. The
 * adapter builds that transaction and broadcasts it; the delegation-policy
 * flow signs it with connect-core's `signDelegationRedemption`, which
 * re-encodes the redemption from the stored delegation and refuses anything
 * else.
 *
 * Transaction encoding is the app's (`codec`), so this package takes no
 * dependency: pass viem's `serializeTransaction` / `keccak256`, or
 * wallet-engine's encoder.
 */

/** An unsigned EIP-1559 transaction, in the codec's terms. */
export interface RedemptionTransaction {
  type: "eip1559";
  chainId: number;
  nonce: number;
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface RedemptionCodec {
  /** keccak256 of the unsigned transaction's signing payload. */
  signingHash: (tx: RedemptionTransaction) => `0x${string}`;
  /** The raw signed transaction, from a 65-byte r‖s‖v (v 27/28) signature. */
  serialize: (
    tx: RedemptionTransaction,
    signature: `0x${string}`,
  ) => `0x${string}`;
}

export interface RedemptionRpc {
  /** Pending nonce of `address`. */
  getTransactionCount: (address: `0x${string}`) => Promise<number>;
  estimateGas: (tx: {
    from: `0x${string}`;
    to: `0x${string}`;
    data: `0x${string}`;
  }) => Promise<bigint>;
  fees: () => Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  sendRawTransaction: (raw: `0x${string}`) => Promise<`0x${string}`>;
}

export interface DelegationFrameworkAdapterOptions {
  manager: SessionKeyManager;
  rpc: RedemptionRpc;
  codec: RedemptionCodec;
  /** The connected chain; must be the one the delegation was signed for. */
  chainId: () => number | null;
}

interface RedemptionPayload {
  outerTx: {
    to: `0x${string}`;
    value: "0x0";
    data: `0x${string}`;
    chainId: number;
    gas: string;
  };
  execution: FrameworkExecution;
  unsigned: RedemptionTransaction;
}

export function createDelegationFrameworkAdapter(
  options: DelegationFrameworkAdapterOptions,
): PolicyExecutionAdapter {
  const { manager, rpc, codec } = options;
  return {
    route: "eip7702",

    async check({ policy }) {
      const ready =
        policy.scope.mode === "eip7702" &&
        policy.status === "active" &&
        Boolean(policy.authorized);
      return {
        ready,
        authorizationInstalled: ready,
        sponsored: false,
        promptless: true,
        executorAddress: DELEGATION_FRAMEWORK.eip7702StatelessDeleGator,
        reason: ready
          ? "The session key redeems its delegation; the chain enforces the caveats."
          : "This policy has no attached EIP-7702 delegation.",
      };
    },

    async prepare({ policy, transaction }) {
      if (!transaction.to) {
        throw new WalletError(
          "invalid_input",
          "A delegated execution needs a target.",
        );
      }
      let value: bigint;
      try {
        value = BigInt(transaction.value ?? "0");
      } catch {
        throw new WalletError(
          "invalid_input",
          "Transaction value is not a quantity.",
        );
      }
      const execution: FrameworkExecution = {
        target: transaction.to as `0x${string}`,
        value,
        callData: (transaction.data ?? "0x") as `0x${string}`,
      };
      const call = await manager.buildDelegationRedemption(
        policy.id,
        execution,
      );
      const chainId = options.chainId();
      if (chainId !== call.chainId) {
        throw new WalletError(
          "chain_mismatch",
          `The delegation is for chain ${call.chainId}, not ${String(chainId)}.`,
        );
      }
      const from = sessionKeyAddress(policy.publicKey);
      const [nonce, gas, fees] = await Promise.all([
        rpc.getTransactionCount(from),
        rpc.estimateGas({ from, to: call.to, data: call.data }),
        rpc.fees(),
      ]);
      const unsigned: RedemptionTransaction = {
        type: "eip1559",
        chainId,
        nonce,
        to: call.to,
        value: 0n,
        data: call.data,
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
      const payload: RedemptionPayload = {
        outerTx: {
          to: call.to,
          value: "0x0",
          data: call.data,
          chainId,
          gas: `0x${gas.toString(16)}`,
        },
        execution,
        unsigned,
      };
      return {
        digest: codec.signingHash(unsigned),
        transaction,
        payload,
      };
    },

    async broadcast({ prepared, signature }) {
      const { unsigned } = (
        prepared as PreparedPolicyExecution & {
          payload: RedemptionPayload;
        }
      ).payload;
      const hash = await rpc.sendRawTransaction(
        codec.serialize(unsigned, signature),
      );
      return { route: "eip7702", hash, status: "submitted" };
    },
  };
}
