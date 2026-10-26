import { type SimulationResult, WalletError } from "@naculus/connect-core";
import { resolveRevertReason } from "./revert-reason";
import { resolveContextSimulationEndpoint } from "./simulation-endpoint";
import type { WalletChain } from "./types";

export interface SimulationTransaction {
  to: string;
  value?: string;
  data?: string;
  gas?: string;
}

export interface SimulationCallClient {
  chain?: { id: number };
  call(args: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
    from?: `0x${string}`;
  }): Promise<unknown>;
}

export interface TransactionSimulationContext {
  chainId?: number;
  currentChain?: WalletChain | null;
  publicClient?: SimulationCallClient | null;
  evmAccount?: string | null;
  fetcher?: typeof fetch;
}

const coverage = {
  balanceChanges: false,
  approvalChanges: false,
  risk: false,
} as const;

function baseResult(
  status: SimulationResult["status"],
  summary: string,
  changesDetected: boolean,
  warnings: SimulationResult["riskAssessment"]["warnings"] = [],
): SimulationResult {
  return {
    status,
    coverage,
    balanceChanges: [],
    approvalChanges: [],
    riskAssessment: { level: "unknown", score: 0, warnings },
    provider: "eth_call",
    summary,
    changesDetected,
  };
}

/** Basic revert check only: never claims asset changes or risk coverage. */
export async function simulateTransactionPreview(
  tx: SimulationTransaction | undefined,
  context: TransactionSimulationContext,
): Promise<SimulationResult> {
  if (!tx)
    return baseResult("unavailable", "No transaction to simulate", false);

  const { chainId, rpcUrl } = resolveContextSimulationEndpoint(
    context.chainId,
    context.currentChain,
  );
  const from = context.evmAccount?.includes(":")
    ? context.evmAccount.split(":").pop()
    : context.evmAccount;

  if (context.publicClient) {
    if (context.publicClient.chain?.id !== chainId) {
      throw new WalletError(
        "invalid_chain",
        "Simulation client chain does not match the requested chain.",
      );
    }
    try {
      await context.publicClient.call({
        to: tx.to as `0x${string}`,
        data: (tx.data ?? "0x") as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : 0n,
        ...(from ? { from: from as `0x${string}` } : {}),
      });
      return {
        ...baseResult(
          "success",
          "Transaction simulation succeeded (basic revert check only)",
          true,
        ),
        gasInfo: tx.gas
          ? { gasLimit: BigInt(tx.gas), estimatedFeeEth: "0" }
          : undefined,
      };
    } catch (cause) {
      const error = cause as {
        message?: string;
        data?: unknown;
        cause?: { data?: unknown };
      };
      const reason = resolveRevertReason(
        error?.data ?? error?.cause?.data,
        error?.message ?? String(cause),
      );
      return {
        ...baseResult(
          "reverted",
          reason ? `Transaction reverted: ${reason}` : "Transaction reverted",
          false,
          [
            {
              category: "simulation_failed",
              severity: "high",
              message: reason
                ? `Transaction would revert: ${reason}`
                : "Transaction would revert",
            },
          ],
        ),
        revertReason: reason,
      };
    }
  }

  if (!rpcUrl) {
    return baseResult(
      "unavailable",
      "Simulation unavailable: no RPC URL",
      false,
      [
        {
          category: "simulation_failed",
          severity: "low",
          message: "No RPC URL or public client available for simulation",
        },
      ],
    );
  }

  try {
    const response = await (context.fetcher ?? fetch)(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_call",
        params: [
          {
            to: tx.to,
            from,
            data: tx.data ?? "0x",
            value: tx.value ?? "0x0",
          },
          "latest",
        ],
      }),
    });
    const json = (await response.json()) as { error?: { message?: string } };
    if (json.error) {
      return baseResult("reverted", "Transaction reverted", false, [
        {
          category: "simulation_failed",
          severity: "high",
          message: `Transaction would revert: ${json.error.message}`,
        },
      ]);
    }
    return baseResult("success", "Transaction simulation succeeded", true);
  } catch (cause) {
    const error = cause as { message?: string };
    return baseResult(
      "unavailable",
      "Simulation unavailable due to network error",
      false,
      [
        {
          category: "simulation_failed",
          severity: "medium",
          message: `Network error: ${error?.message ?? "Unknown"}`,
        },
      ],
    );
  }
}
