/// <reference types="vitest" />
/// @vitest-environment jsdom

import type { PaymentFetchResult } from "@naculus/connect-appkit-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePaymentFetch } from "./usePaymentFetch";

const URL_ = "https://api.example.com/data";
const x402Paid = {
  scheme: "exact",
  network: "eip155:8453",
  amount: "10000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
};

function paid(over: Partial<PaymentFetchResult> = {}): PaymentFetchResult {
  return { response: new Response("ok"), paid: x402Paid, ...over };
}

describe("usePaymentFetch", () => {
  it("passes the request through and records the payment", async () => {
    const pay = vi.fn().mockResolvedValue(paid());
    const { result } = renderHook(() => usePaymentFetch(pay));
    const init = { method: "POST", body: "q" };
    await act(async () => {
      await result.current.payFetch(URL_, init);
    });
    expect(pay).toHaveBeenCalledWith(URL_, init);
    expect(result.current.lastPayment).toMatchObject({
      protocol: "x402",
      amount: "10000",
      resource: URL_,
    });
    expect(result.current.isPending).toBe(false);
  });

  it("keeps the last payment when a later request pays nothing", async () => {
    const pay = vi
      .fn()
      .mockResolvedValueOnce(paid())
      .mockResolvedValueOnce(paid({ paid: null }));
    const { result } = renderHook(() => usePaymentFetch(pay));
    await act(async () => {
      await result.current.payFetch(URL_);
      await result.current.payFetch(URL_);
    });
    expect(result.current.lastPayment?.amount).toBe("10000");
  });

  it("publishes and rethrows a failure", async () => {
    const pay = vi.fn().mockRejectedValue(new Error("payment_rejected"));
    const { result } = renderHook(() => usePaymentFetch(pay));
    await act(async () => {
      await expect(result.current.payFetch(URL_)).rejects.toThrow(
        "payment_rejected",
      );
    });
    expect(result.current.error?.message).toBe("payment_rejected");
  });

  it("records every payment in completion order, even from an older request", async () => {
    let finishFirst!: (r: PaymentFetchResult) => void;
    const pay = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<PaymentFetchResult>((r) => (finishFirst = r)),
      )
      .mockResolvedValueOnce(paid({ paid: { ...x402Paid, amount: "2" } }));
    const { result } = renderHook(() => usePaymentFetch(pay));
    let first!: Promise<PaymentFetchResult>;
    await act(async () => {
      first = result.current.payFetch(URL_);
      await result.current.payFetch(URL_);
    });
    expect(result.current.lastPayment?.amount).toBe("2");
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      finishFirst(paid({ paid: { ...x402Paid, amount: "1" } }));
      await first;
    });
    // The older request settled last and it spent money: it is the last payment.
    expect(result.current.lastPayment?.amount).toBe("1");
    expect(result.current.isPending).toBe(false);
  });

  it("stops an in-flight request from recording after reset", async () => {
    let finish!: (r: PaymentFetchResult) => void;
    const pay = vi.fn(
      () => new Promise<PaymentFetchResult>((r) => (finish = r)),
    );
    const { result } = renderHook(() => usePaymentFetch(pay));
    await act(async () => {
      const pending = result.current.payFetch(URL_);
      result.current.reset();
      finish(paid());
      await pending;
    });
    expect(result.current.lastPayment).toBeNull();
  });

  it("uses the latest paying fetch, and reset clears state", async () => {
    const a = vi.fn().mockResolvedValue(paid());
    const b = vi.fn().mockResolvedValue(paid());
    const { result, rerender } = renderHook(({ pay }) => usePaymentFetch(pay), {
      initialProps: { pay: a },
    });
    rerender({ pay: b });
    await act(async () => {
      await result.current.payFetch(URL_);
    });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    act(() => result.current.reset());
    expect(result.current.lastPayment).toBeNull();
  });

  it("verifies asynchronously and retries pending until verified", async () => {
    vi.useFakeTimers();
    const pay = vi.fn().mockResolvedValue(paid());
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "verified" });
    const { result } = renderHook(() =>
      usePaymentFetch(pay, {
        verify,
        verifyRetry: { attempts: 3, delayMs: 10 },
      }),
    );
    await act(async () => {
      await result.current.payFetch(URL_);
    });
    expect(result.current.lastPayment?.verification.status).toBe("pending");
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(result.current.lastPayment).toMatchObject({
      verification: { status: "verified" },
    });
    expect(verify).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("stops verification retries on mismatch", async () => {
    const verify = vi.fn().mockResolvedValue({
      status: "mismatch",
      reason: "wrong recipient",
    });
    const { result } = renderHook(() =>
      usePaymentFetch(vi.fn().mockResolvedValue(paid()), { verify }),
    );
    await act(async () => {
      await result.current.payFetch(URL_);
      await Promise.resolve();
    });
    expect(result.current.lastPayment?.verification).toEqual({
      status: "mismatch",
      reason: "wrong recipient",
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("does not publish a retry after unmount", async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue({ status: "pending" });
    const { result, unmount } = renderHook(() =>
      usePaymentFetch(vi.fn().mockResolvedValue(paid()), {
        verify,
        verifyRetry: { attempts: 3, delayMs: 10 },
      }),
    );
    await act(async () => {
      await result.current.payFetch(URL_);
    });
    unmount();
    await vi.advanceTimersByTimeAsync(20);
    expect(verify).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
