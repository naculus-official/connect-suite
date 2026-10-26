import { isValidAddress } from "@naculus/connect-core";

/**
 * Chain-abstraction (routing) domain types and the few decisions the React
 * hooks and Vue composables share. The hooks inject the actual quote /
 * compare / execute functions; nothing here talks to a network.
 */

// ── Quotes ────────────────────────────────────────────────────────

export interface RouteQuote {
  routeId: string;
  provider: string;
  netReceiveFormatted: string;
  toTokenSymbol: string;
}

export interface RouteQuoteOptions {
  sortBy?: "cost" | "time" | "balance";
  maxSlippage?: number;
}

export interface RouteQuoteInput {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken?: string;
  amount: string;
  options?: RouteQuoteOptions;
}

export type GetRouteQuotes = (
  from: string,
  to: string,
  token: string,
  amount: string,
  options?: RouteQuoteOptions,
  toToken?: string,
) => Promise<RouteQuote[]>;

/**
 * `BigInt()` throws on anything that is not a decimal integer — "1.5", "abc",
 * "1e18" — so a user typing into an amount field must not reach it. Only a
 * positive base-unit integer is a quotable amount.
 */
export function isPositiveIntegerAmount(amount: string): boolean {
  return /^(?:0|[1-9][0-9]*)$/.test(amount) && BigInt(amount) > 0n;
}

/** True when every field a quote needs is present and the amount is quotable. */
export function isQuotableInput(input: RouteQuoteInput): boolean {
  return Boolean(
    input.fromChain &&
      input.toChain &&
      input.fromToken &&
      isPositiveIntegerAmount(input.amount),
  );
}

// ── Cost comparison ───────────────────────────────────────────────

export interface CostComparison {
  chain: string;
  chainName: string;
  totalCost: string;
  gasCost: string;
  estimatedTimeMs: number;
}

export type CostComparisonOperation =
  | "send_erc20"
  | "swap"
  | "bridge"
  | (string & {});

export interface CostComparisonOptions {
  amount?: string;
  token?: string;
  [key: string]: unknown;
}

export interface CompareCostsInput {
  operation: CostComparisonOperation;
  chains: string[];
  options?: CostComparisonOptions;
}

export type CompareCosts = (
  operation: string,
  chains: string[],
  options?: CostComparisonOptions,
) => Promise<CostComparison[]>;

/**
 * Value key for a compare-costs input. `chains` is an array and `options` an
 * object; keying on identity re-fired the fetch on every render/reactive tick
 * for a caller writing the natural inline literal — an unbounded loop against
 * a cost API.
 */
export function compareCostsKey(input: CompareCostsInput): string {
  const options = input.options;
  const optionsKey = options
    ? Object.keys(options)
        .sort()
        .map((key) => {
          const value = options[key];
          return `${key}=${
            typeof value === "object" && value !== null
              ? "[object]"
              : String(value)
          }`;
        })
        .join("&")
    : "";
  return `${input.operation}|${(input.chains ?? []).join(",")}|${optionsKey}`;
}

// ── Execution ─────────────────────────────────────────────────────

export interface ExecutableQuote {
  routeId: string;
  provider: string;
  totalCost?: bigint;
  estimatedTimeMs?: number;
  toChain?: string;
}

export interface ExecuteRouteResult {
  fromTxHash: string;
  toTxHash?: string;
}

export interface ExecuteRouteOptions {
  timeoutMs?: number;
  gasLimit?: bigint;
}

export interface ExecuteRouteError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ExecuteRoute = (
  quote: ExecutableQuote,
  recipient: string,
  options?: ExecuteRouteOptions,
) => Promise<ExecuteRouteResult>;

/**
 * Recipient check before a cross-chain execution. An empty recipient is wrong
 * on every chain. Beyond that the destination namespace decides: when the
 * quote names `toChain`, the address is validated for that namespace; when it
 * does not, this returns null and the executor decides, rather than rejecting
 * a valid non-EVM address on a guess.
 */
export function validateRouteRecipient(
  quote: ExecutableQuote | null | undefined,
  recipient: string,
): ExecuteRouteError | null {
  if (typeof recipient !== "string" || recipient.trim() === "") {
    return {
      code: "invalid_recipient",
      message: "A recipient address is required",
    };
  }
  const namespace = quote?.toChain?.split(":")[0];
  if (namespace && !isValidAddress(recipient, namespace)) {
    return {
      code: "invalid_recipient",
      message: `"${recipient}" is not a valid ${namespace} address for the destination chain ${quote?.toChain}`,
    };
  }
  return null;
}

/** Normalize whatever an executor threw into the hook's error shape. */
export function toExecuteRouteError(cause: unknown): ExecuteRouteError {
  const error = cause as {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  return {
    code: error?.code ?? "execution_failed",
    message: error?.message ?? String(cause),
    details: error?.details,
  };
}
