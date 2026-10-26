import type { PaymentFetchResult } from "@naculus/connect-appkit-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
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

function mount<T>(fn: () => T) {
  const scope = effectScope();
  return { hook: scope.run(fn) as T, scope };
}

describe("usePaymentFetch", () => {
  it("passes the request through and records the payment", async () => {
    const pay = vi.fn().mockResolvedValue(paid());
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    const init = { method: "POST", body: "q" };
    const result = await hook.payFetch(URL_, init);
    expect(pay).toHaveBeenCalledWith(URL_, init);
    expect(result.paid).toBe(x402Paid);
    expect(hook.lastPayment.value).toMatchObject({
      protocol: "x402",
      amount: "10000",
      resource: URL_,
    });
    expect(hook.isPending.value).toBe(false);
    scope.stop();
  });

  it("keeps the last payment when a later request pays nothing", async () => {
    const pay = vi
      .fn()
      .mockResolvedValueOnce(paid())
      .mockResolvedValueOnce(paid({ paid: null }));
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    await hook.payFetch(URL_);
    await hook.payFetch(URL_);
    expect(hook.lastPayment.value?.amount).toBe("10000");
    scope.stop();
  });

  it("publishes and rethrows a failure", async () => {
    const pay = vi.fn().mockRejectedValue(new Error("payment_rejected"));
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    await expect(hook.payFetch(URL_)).rejects.toThrow("payment_rejected");
    expect(hook.error.value?.message).toBe("payment_rejected");
    scope.stop();
  });

  it("records every payment in completion order, even from an older request", async () => {
    let finishFirst!: (r: PaymentFetchResult) => void;
    const pay = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<PaymentFetchResult>((r) => (finishFirst = r)),
      )
      .mockResolvedValueOnce(paid({ paid: { ...x402Paid, amount: "2" } }));
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    const first = hook.payFetch(URL_);
    await hook.payFetch(URL_);
    expect(hook.lastPayment.value?.amount).toBe("2");
    expect(hook.isPending.value).toBe(true);
    finishFirst(paid({ paid: { ...x402Paid, amount: "1" } }));
    await first;
    // The older request settled last and it spent money: it is the last payment.
    expect(hook.lastPayment.value?.amount).toBe("1");
    expect(hook.isPending.value).toBe(false);
    scope.stop();
  });

  it("stops an in-flight request from recording after reset or disposal", async () => {
    let finish!: (r: PaymentFetchResult) => void;
    const pay = vi.fn(
      () => new Promise<PaymentFetchResult>((r) => (finish = r)),
    );
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    const pending = hook.payFetch(URL_);
    hook.reset();
    finish(paid());
    await pending;
    expect(hook.lastPayment.value).toBeNull();

    const late = hook.payFetch(URL_);
    scope.stop();
    finish(paid());
    await late;
    expect(hook.lastPayment.value).toBeNull();
  });

  it("uses the current paying fetch from a ref, and reset clears state", async () => {
    const a = vi.fn().mockResolvedValue(paid());
    const b = vi.fn().mockResolvedValue(paid());
    const pay = ref(a);
    const { hook, scope } = mount(() => usePaymentFetch(pay));
    pay.value = b;
    await hook.payFetch(URL_);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    hook.reset();
    expect(hook.lastPayment.value).toBeNull();
    scope.stop();
  });

  it("verifies asynchronously and retries pending until verified", async () => {
    vi.useFakeTimers();
    const verify = vi
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "verified" });
    const { hook, scope } = mount(() =>
      usePaymentFetch(vi.fn().mockResolvedValue(paid()), {
        verify,
        verifyRetry: { attempts: 3, delayMs: 10 },
      }),
    );
    await hook.payFetch(URL_);
    expect(hook.lastPayment.value?.verification.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(10);
    expect(hook.lastPayment.value).toMatchObject({
      verification: { status: "verified" },
    });
    expect(verify).toHaveBeenCalledTimes(2);
    scope.stop();
    vi.useRealTimers();
  });

  it("stops verification retries on mismatch", async () => {
    const verify = vi.fn().mockResolvedValue({
      status: "mismatch",
      reason: "wrong recipient",
    });
    const { hook, scope } = mount(() =>
      usePaymentFetch(vi.fn().mockResolvedValue(paid()), { verify }),
    );
    await hook.payFetch(URL_);
    await Promise.resolve();
    expect(hook.lastPayment.value?.verification).toEqual({
      status: "mismatch",
      reason: "wrong recipient",
    });
    expect(verify).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("does not publish a retry after scope disposal", async () => {
    vi.useFakeTimers();
    const verify = vi.fn().mockResolvedValue({ status: "pending" });
    const { hook, scope } = mount(() =>
      usePaymentFetch(vi.fn().mockResolvedValue(paid()), {
        verify,
        verifyRetry: { attempts: 3, delayMs: 10 },
      }),
    );
    await hook.payFetch(URL_);
    scope.stop();
    await vi.advanceTimersByTimeAsync(20);
    expect(verify).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
