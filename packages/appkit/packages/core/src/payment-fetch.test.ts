import { describe, expect, it } from "vitest";
import {
  applySettlementVerification,
  DEFAULT_VERIFY_RETRY,
  describePayment,
  type PaymentFetchResult,
} from "./payment-fetch";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const TX = `0x${"ab".repeat(32)}`;
const URL_ = "https://api.example.com/data";

function result(over: Partial<PaymentFetchResult>): PaymentFetchResult {
  return { response: new Response("ok"), paid: null, ...over };
}

describe("describePayment", () => {
  it("is null when nothing was paid", () => {
    expect(describePayment(URL_, result({}))).toBeNull();
  });

  it("reads an x402 requirement and its settlement", () => {
    const paid = {
      scheme: "exact",
      network: "eip155:8453",
      amount: "10000",
      asset: USDC,
      payTo: PAYEE,
      maxTimeoutSeconds: 60,
    };
    expect(
      describePayment(
        new Request(URL_),
        result({
          paid,
          settlement: {
            success: true,
            transaction: TX,
            network: "eip155:8453",
          },
        }),
      ),
    ).toEqual({
      protocol: "x402",
      resource: URL_,
      chainId: "eip155:8453",
      asset: USDC,
      payTo: PAYEE,
      amount: "10000",
      reference: TX,
      verification: { status: "unverified" },
    });
    // A failed or missing settlement names no transaction.
    expect(
      describePayment(
        URL_,
        result({ paid, settlement: { success: false, transaction: TX } }),
      )?.reference,
    ).toBeNull();
    expect(describePayment(URL_, result({ paid }))?.reference).toBeNull();
    expect(
      describePayment(
        URL_,
        result({
          paid,
          settlement: { success: true, transaction: TX, network: "eip155:1" },
        }),
      )?.reference,
    ).toBeNull();
  });

  it("reads an MPP evm charge and its receipt", () => {
    const paid = {
      challenge: {
        params: { id: "c1", realm: "api", method: "evm", intent: "charge" },
        request: {},
      },
      request: {
        amount: "250000",
        currency: USDC,
        recipient: PAYEE,
        chainId: 8453,
      },
      domain: {},
    };
    expect(
      describePayment(
        new URL(URL_),
        result({ paid, receipt: { status: "success", reference: TX } }),
      ),
    ).toEqual({
      protocol: "mpp",
      resource: URL_,
      chainId: "eip155:8453",
      asset: USDC,
      payTo: PAYEE,
      amount: "250000",
      reference: TX,
      verification: { status: "unverified" },
    });
  });

  it("reads an MPP solana charge's cluster, and invents none otherwise", () => {
    const MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    const paid = {
      method: "solana",
      challenge: { params: { method: "solana" } },
      request: {
        amount: "250000",
        currency: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        recipient: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
        network: MAINNET,
      },
    };
    expect(describePayment(URL_, result({ paid }))).toMatchObject({
      protocol: "mpp",
      chainId: MAINNET,
      amount: "250000",
    });
    const other = {
      challenge: { params: { method: "tempo" } },
      request: { amount: "1", currency: "x", recipient: "y", chainId: 1 },
    };
    expect(describePayment(URL_, result({ paid: other }))?.chainId).toBeNull();
  });

  it("reads an x402 Solana requirement like an EVM one", () => {
    const paid = {
      scheme: "exact",
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      amount: "1000",
      asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      payTo: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
    };
    expect(describePayment(URL_, result({ paid }))).toMatchObject({
      protocol: "x402",
      chainId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    });
  });

  it("reports an unrecognized shape as unknown rather than guessing", () => {
    expect(describePayment(URL_, result({ paid: { amount: "5" } }))).toEqual({
      protocol: "unknown",
      resource: URL_,
      chainId: null,
      asset: null,
      payTo: null,
      amount: null,
      reference: null,
      verification: { status: "unverified" },
    });
  });

  it("labels a settlement verified only after a verified result", () => {
    const payment = describePayment(
      URL_,
      result({
        paid: {
          scheme: "exact",
          network: "eip155:8453",
          amount: "1",
          asset: USDC,
          payTo: PAYEE,
        },
      }),
    );
    expect(payment).not.toBeNull();
    const mismatch = applySettlementVerification(payment!, {
      status: "mismatch",
      reason: "wrong recipient",
    });
    expect(mismatch).toMatchObject({
      verification: { status: "mismatch", reason: "wrong recipient" },
    });
    expect(
      applySettlementVerification(mismatch, { status: "verified" }),
    ).toMatchObject({
      verification: { status: "verified" },
    });
  });

  it("uses the documented verification retry defaults", () => {
    expect(DEFAULT_VERIFY_RETRY).toEqual({
      attempts: 5,
      delayMs: 4_000,
    });
  });
});
