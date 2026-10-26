import type { Address, Hex, UserOperationReceipt } from "@naculus/connect-core";

/**
 * Validation of an ERC-4337 `eth_getUserOperationReceipt` result, shared by
 * the React hook and the Vue composable. A bundler is an untrusted party:
 * every field is checked, the hash must match the one asked for, and a
 * malformed receipt is refused instead of banked as a confirmation.
 */

export class InvalidUserOperationReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUserOperationReceiptError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}
function isHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}
function isHexData(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}
function parseQuantity(value: unknown, field: string): bigint {
  if (
    typeof value !== "string" ||
    !/^(?:0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)|(?:0|[1-9][0-9]*))$/.test(value)
  ) {
    throw new InvalidUserOperationReceiptError(
      `Bundler returned an invalid ${field}.`,
    );
  }
  return BigInt(value);
}

export function parseUserOperationReceipt(
  value: unknown,
  expectedHash: Hex,
): UserOperationReceipt {
  if (!isRecord(value)) {
    throw new InvalidUserOperationReceiptError(
      "Bundler returned an invalid UserOperation receipt.",
    );
  }
  if (
    !isHash(value.userOpHash) ||
    value.userOpHash.toLowerCase() !== expectedHash.toLowerCase()
  ) {
    throw new InvalidUserOperationReceiptError(
      "Bundler receipt does not match the requested UserOperation hash.",
    );
  }
  if (!isAddress(value.entryPoint) || !isAddress(value.sender)) {
    throw new InvalidUserOperationReceiptError(
      "Bundler receipt contains an invalid account address.",
    );
  }
  if (
    value.paymaster !== undefined &&
    value.paymaster !== null &&
    !isAddress(value.paymaster)
  ) {
    throw new InvalidUserOperationReceiptError(
      "Bundler receipt contains an invalid paymaster address.",
    );
  }
  if (typeof value.success !== "boolean" || !isHash(value.transactionHash)) {
    throw new InvalidUserOperationReceiptError(
      "Bundler receipt contains an invalid execution result.",
    );
  }
  if (!Array.isArray(value.logs)) {
    throw new InvalidUserOperationReceiptError(
      "Bundler receipt contains invalid logs.",
    );
  }
  const logs = value.logs.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !isAddress(candidate.address) ||
      !Array.isArray(candidate.topics) ||
      !candidate.topics.every(isHash) ||
      !isHexData(candidate.data)
    ) {
      throw new InvalidUserOperationReceiptError(
        "Bundler receipt contains an invalid log entry.",
      );
    }
    return {
      address: candidate.address,
      topics: candidate.topics,
      data: candidate.data,
    };
  });
  return {
    userOpHash: value.userOpHash,
    entryPoint: value.entryPoint,
    sender: value.sender,
    nonce: parseQuantity(value.nonce, "nonce"),
    ...(value.paymaster === undefined || value.paymaster === null
      ? {}
      : { paymaster: value.paymaster }),
    actualGasUsed: parseQuantity(value.actualGasUsed, "actualGasUsed"),
    actualGasCost: parseQuantity(value.actualGasCost, "actualGasCost"),
    success: value.success,
    transactionHash: value.transactionHash,
    logs,
  };
}

/**
 * One `eth_getUserOperationReceipt` call. Resolves to the validated receipt,
 * or null while the operation is not yet included. HTTP and JSON-RPC
 * failures throw a plain Error (retryable); a malformed receipt throws
 * InvalidUserOperationReceiptError (not retryable — the bundler is lying).
 */
export async function fetchUserOperationReceipt(
  bundlerUrl: string,
  hash: Hex,
  signal?: AbortSignal,
): Promise<UserOperationReceipt | null> {
  const response = await fetch(bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getUserOperationReceipt",
      params: [hash],
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Bundler returned HTTP ${response.status} while reading UserOperation status.`,
    );
  }
  const json = (await response.json()) as {
    result?: unknown;
    error?: { code?: unknown; message?: unknown };
  };
  if (json.error) {
    throw new Error(
      typeof json.error.message === "string"
        ? json.error.message
        : "Bundler returned a JSON-RPC error.",
    );
  }
  if (json.result === undefined || json.result === null) return null;
  return parseUserOperationReceipt(json.result, hash);
}
