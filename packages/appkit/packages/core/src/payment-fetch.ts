import type { SettlementVerification } from "@naculus/connect-core";

/**
 * Agentic payments (x402 / MPP) for the appkit shells.
 *
 * The app builds the paying fetch itself — `createX402Fetch` from
 * `@naculus/payments-x402` or `createMppFetch` from `@naculus/payments-mpp`,
 * with the session key and limits it chooses — and the hooks only track its
 * state. So appkit takes no dependency on either package: their results are
 * read here by shape, and a shape this does not recognize is reported as
 * `protocol: "unknown"` rather than guessed at.
 */

/** What `createX402Fetch` and `createMppFetch` return, structurally. */
export interface PaymentFetchResult {
  response: Response;
  /** The requirement (x402) or charge (MPP) paid; null when nothing was. */
  paid: unknown;
  /** x402 `PAYMENT-RESPONSE`. */
  settlement?: unknown;
  /** MPP `Payment-Receipt`. */
  receipt?: unknown;
}

export type PaymentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<PaymentFetchResult>;

export type PaymentVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "mismatch"
  | "failed"
  | "unavailable";

export interface PaymentVerification {
  status: PaymentVerificationStatus;
  reason?: string;
}

/** One payment, in the terms a UI shows. Amounts are token base units. */
export interface PaymentRecord {
  protocol: "x402" | "mpp" | "unknown";
  /** The URL that was requested. */
  resource: string;
  /** CAIP-2 chain, e.g. `eip155:8453`; null when unknown. */
  chainId: string | null;
  /** Token contract; null when unknown. */
  asset: string | null;
  payTo: string | null;
  amount: string | null;
  /**
   * Settlement transaction hash as the server reported it — unverified; the
   * other fields are what the client signed.
   */
  reference: string | null;
  /** A server-reported reference remains unverified until this is verified. */
  verification: PaymentVerification;
}

export const DEFAULT_VERIFY_RETRY = { attempts: 5, delayMs: 4_000 } as const;

export interface VerifyRetryOptions {
  attempts: number;
  delayMs: number;
}

/** Apply a verifier result without mutating the payment record. */
export function applySettlementVerification(
  payment: PaymentRecord,
  result: SettlementVerification,
): PaymentRecord {
  return {
    ...payment,
    verification: {
      status: result.status,
      ...("reason" in result && result.reason !== undefined
        ? { reason: result.reason }
        : {}),
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.href;
  if (typeof input !== "string") return input.url;
  // The paying fetch resolves the URL through Request; show the same one.
  try {
    return new Request(input).url;
  } catch {
    return input;
  }
}

/**
 * The payment a paying fetch made, or null when it paid nothing. Reads the
 * x402 requirement / settlement (EVM or Solana) or the MPP `evm` / `solana`
 * charge / receipt by shape.
 */
export function describePayment(
  input: RequestInfo | URL,
  result: PaymentFetchResult,
): PaymentRecord | null {
  const paid = record(result.paid);
  if (!paid) return null;
  const resource = requestUrl(input);

  // x402: an accepted PaymentRequirements.
  if (typeof paid.scheme === "string" && typeof paid.network === "string") {
    const settlement = record(result.settlement);
    return {
      protocol: "x402",
      resource,
      chainId: text(paid.network),
      asset: text(paid.asset),
      payTo: text(paid.payTo),
      amount: text(paid.amount),
      // A hash reported for another chain is not this payment's.
      reference:
        settlement?.success === true && settlement.network === paid.network
          ? text(settlement.transaction)
          : null,
      verification: { status: "unverified" },
    };
  }

  // MPP: a selected charge (challenge + decoded request).
  const challenge = record(record(paid.challenge)?.params);
  const request = record(paid.request);
  if (challenge && request) {
    const chainId =
      challenge.method === "evm" &&
      typeof request.chainId === "number" &&
      Number.isSafeInteger(request.chainId)
        ? `eip155:${request.chainId}`
        : challenge.method === "solana" &&
            typeof request.network === "string" &&
            /^solana:[1-9A-HJ-NP-Za-km-z]{32}$/.test(request.network)
          ? request.network
          : null;
    return {
      protocol: "mpp",
      resource,
      chainId,
      asset: text(request.currency),
      payTo: text(request.recipient),
      amount: text(request.amount),
      reference: text(record(result.receipt)?.reference),
      verification: { status: "unverified" },
    };
  }

  return {
    protocol: "unknown",
    resource,
    chainId: null,
    asset: null,
    payTo: null,
    amount: null,
    reference: null,
    verification: { status: "unverified" },
  };
}
