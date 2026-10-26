import { errorMessage } from "@naculus/connect-appkit-core";
import type {
  BatchCall,
  CallsStatus,
  ExecutionStrategy,
} from "@naculus/connect-core";
import {
  chooseExecutionStrategy,
  getAccountCapabilities,
  WalletError,
} from "@naculus/connect-core";
import { useCallback, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { extractTransactionHash } from "./transaction-hash";

/**
 * Where a batch has got to.
 *
 * `"submitted"` was `"confirmed"`, which this hook is two steps away from
 * knowing. `wallet_sendCalls` answers with a bundle identifier, and a bundle
 * identifier does not even promise the calls were broadcast — EIP-5792 lets a
 * wallet accept them and send later. The sequential fallback returns the last
 * transaction hash, which promises broadcast and nothing more.
 *
 * `getCallsStatus` is what turns a bundle identifier into an outcome.
 */
export type SendCallsStatus =
  | "idle"
  | "awaiting_approval"
  | "submitted"
  | "failed";

export function useSendCalls() {
  const { session, chainId, client } = useWeb3();
  const [status, setStatus] = useState<SendCallsStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [batchHash, setBatchHash] = useState<string | null>(null);
  const [callsStatus, setCallsStatus] = useState<CallsStatus | null>(null);
  const [execution, setExecution] = useState<ExecutionStrategy | null>(null);

  const sendCalls = useCallback(
    async (
      calls: BatchCall[],
      options?: {
        chainId?: string;
        strategy?: ExecutionStrategy;
        paymasterService?: {
          url: string;
          context?: Record<string, unknown>;
        };
      },
    ): Promise<string> => {
      if (!session) {
        setStatus("failed");
        const err = new WalletError("wallet_unavailable", "No active session");
        setError(err);
        throw err;
      }

      if (calls.length === 0) {
        setStatus("failed");
        const err = new WalletError(
          "invalid_input",
          "At least one call is required",
        );
        setError(err);
        throw err;
      }

      setStatus("awaiting_approval");
      setError(null);
      setBatchHash(null);

      try {
        const activeClient = resolveClient(client);
        if (!activeClient) {
          throw new WalletError("wallet_unavailable", "Client not initialized");
        }
        const targetChain = options?.chainId ?? chainId ?? undefined;

        // Ask what the account can actually do before assuming it can batch.
        // A wallet with no answer, or one that says no, gets the sequential
        // path instead of an outright failure — the caller asked to send
        // these calls, not specifically to use EIP-5792.
        const strategy =
          options?.strategy ??
          chooseExecutionStrategy(
            await getAccountCapabilities(activeClient, session, targetChain),
            calls.length,
          );
        setExecution(strategy);

        if (strategy === "atomic-batch") {
          // This path was chosen because the wallet said it can execute the
          // calls atomically, so require it. Without the flag EIP-5792 lets
          // the wallet split the batch anyway, and the caller would be told
          // "atomic-batch" for an execution that was not.
          const result = await activeClient.sendCalls(
            session,
            calls,
            targetChain,
            {
              atomicRequired: true,
              ...(options?.paymasterService
                ? { paymasterService: options.paymasterService }
                : {}),
            },
          );
          setStatus("submitted");
          setBatchHash(result);
          return result;
        }

        // Sequential fallback. These calls are NOT atomic: an earlier one can
        // land while a later one fails, so the returned hash is the last
        // transaction and `execution` says how it was sent. A caller that
        // needs all-or-nothing must check `capabilities.atomicBatch` first.
        let lastHash = "";
        for (let i = 0; i < calls.length; i++) {
          const call = calls[i];
          try {
            lastHash = extractTransactionHash(
              await activeClient.sendTransaction(session, {
                transaction: {
                  to: call.to,
                  data: call.data,
                  value: call.value,
                },
                chainId: targetChain,
              }),
            );
          } catch (err) {
            // The dangerous case for this path: an approve landed and the swap
            // it was for did not. Say how far it got, because the caller now
            // has on-chain state it did not ask for and cannot infer the count
            // from a bare wallet error.
            throw new WalletError(
              "tx_failed",
              `Call ${i + 1} of ${calls.length} failed after ${i} already landed ` +
                `(sent sequentially — this wallet cannot batch atomically): ` +
                `${errorMessage(err)}`,
            );
          }
        }
        setStatus("submitted");
        setBatchHash(lastHash);
        return lastHash;
      } catch (err) {
        setStatus("failed");
        setError(err instanceof Error ? err : new Error(errorMessage(err)));
        throw err;
      }
    },
    [session, chainId, client],
  );

  const getCallsStatus = useCallback(
    async (hash?: string): Promise<CallsStatus> => {
      if (!session) {
        throw new WalletError("wallet_unavailable", "No active session");
      }

      const bundleHash = hash ?? batchHash;
      if (!bundleHash) {
        throw new WalletError("invalid_input", "No bundle hash available");
      }
      // After a sequential send the stored handle is a transaction hash, not an
      // EIP-5792 bundle identifier. Querying the wallet with it returns an
      // opaque error at best; refusing here names the actual reason.
      if (!hash && execution === "sequential") {
        throw new WalletError(
          "invalid_input",
          "Calls were sent sequentially, so there is no bundle to query. " +
            "Track the returned transaction hash instead.",
        );
      }

      const activeClient = resolveClient(client);
      if (!activeClient) {
        throw new WalletError("wallet_unavailable", "Client not initialized");
      }
      const result = await activeClient.getCallsStatus(session, bundleHash);
      setCallsStatus(result);
      return result;
    },
    [session, batchHash, client, execution],
  );

  /**
   * Ask the wallet to display the bundle.
   *
   * Cosmetic: a wallet that refuses, or has no such screen, leaves the bundle
   * exactly as it was. Returns whether the wallet showed it, so a caller can
   * fall back to its own UI rather than surfacing a transaction error for
   * something that is not one.
   */
  const showCallsStatus = useCallback(
    async (hash?: string): Promise<boolean> => {
      if (!session) return false;
      const bundleHash = hash ?? batchHash;
      if (!bundleHash) return false;
      // After a sequential send the handle is a transaction hash, not a
      // bundle, so there is nothing for the wallet to look up.
      if (!hash && execution === "sequential") return false;

      const activeClient = resolveClient(client);
      if (!activeClient?.showCallsStatus) return false;
      try {
        await activeClient.showCallsStatus(session, bundleHash);
        return true;
      } catch {
        return false;
      }
    },
    [session, batchHash, client, execution],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setBatchHash(null);
    setCallsStatus(null);
    setExecution(null);
  }, []);

  return {
    sendCalls,
    getCallsStatus,
    showCallsStatus,
    status,
    error,
    batchHash,
    callsStatus,
    /**
     * How the last send was actually executed, or null before one runs.
     *
     * "sequential" means the calls were sent one at a time and are NOT atomic:
     * an earlier call can land while a later one fails. Surfaced rather than
     * hidden because a caller batching an approve + swap needs to know which
     * guarantee it got.
     */
    execution,
    reset,
    isSending: status === "awaiting_approval",
  };
}
