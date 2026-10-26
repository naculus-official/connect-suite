/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseCapabilities = vi.fn();
vi.mock("./useCapabilities", () => ({
  useCapabilities: () => mockUseCapabilities(),
}));
const mockUseDelegation = vi.fn<
  () => { delegated: boolean | null; delegate: string | null }
>(() => ({ delegated: null, delegate: null }));
vi.mock("./useDelegation", () => ({
  useDelegation: () => mockUseDelegation(),
}));
const mockSendCalls = vi.fn(async () => "0xbatch");
vi.mock("./useSendCalls", () => ({
  useSendCalls: () => ({ sendCalls: mockSendCalls }),
}));

import { useExecuteCalls } from "./useExecuteCalls";

function withAtomic(atomic: string, maxBatchSize?: number) {
  mockUseCapabilities.mockReturnValue({
    atomic,
    current: maxBatchSize === undefined ? null : { maxBatchSize },
  });
}

const CALLS = [{ to: "0x1" as const }, { to: "0x2" as const }];

beforeEach(() => {
  vi.clearAllMocks();
  mockSendCalls.mockResolvedValue("0xbatch");
  mockUseDelegation.mockReturnValue({ delegated: null, delegate: null });
});

describe("useExecuteCalls — preview", () => {
  it("says the calls will land together when the wallet batches", () => {
    withAtomic("supported");
    const { result } = renderHook(() => useExecuteCalls());
    const plan = result.current.preview(2, "required");
    expect(plan.route).toBe("wallet-batch");
    expect(plan.atomic).toBe(true);
  });

  it("says they will be sent one by one when it cannot", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    const plan = result.current.preview(2, "preferred");
    expect(plan.route).toBe("sequential");
    expect(plan.atomic).toBe(false);
    expect(plan.reason).toMatch(/one by one/);
  });

  // The whole point: an approve batched with the swap it pays for, sent
  // separately, leaves an approval standing to a contract the user never
  // transacted with.
  it("has no route at all when atomicity is required and impossible", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(2, "required").route).toBeNull();
  });

  it("routes to a UserOperation rather than refusing when one is available", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() =>
      useExecuteCalls({ userOperation: async () => "0xuserop" }),
    );
    const plan = result.current.preview(2, "required");
    expect(plan.route).toBe("user-operation");
    expect(plan.atomic).toBe(true);
  });

  it("leaves a single call alone — it is atomic by itself", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    const plan = result.current.preview(1, "required");
    expect(plan.route).toBe("sequential");
    expect(plan.atomic).toBe(true);
  });

  // An older wallet may batch atomically without being able to advertise it,
  // and a flagged batch is rejected cleanly if it cannot.
  it("still tries a batch when the wallet never answered the query", () => {
    withAtomic("unknown");
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(2, "required").route).toBe("wallet-batch");
  });

  it("refuses a batch larger than the wallet accepts", () => {
    withAtomic("supported", 3);
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(5, "required").route).toBeNull();
  });

  it("never returns a plan without a reason", () => {
    for (const atomic of ["supported", "unsupported", "unknown"]) {
      withAtomic(atomic);
      const { result } = renderHook(() => useExecuteCalls());
      for (const req of ["required", "preferred", "any"] as const) {
        expect(result.current.preview(2, req).reason.length).toBeGreaterThan(
          20,
        );
      }
    }
  });
});

describe("useExecuteCalls — execute", () => {
  it("sends through the wallet batch when that is the route", async () => {
    withAtomic("supported");
    const { result } = renderHook(() => useExecuteCalls());
    await act(async () => {
      await result.current.execute(CALLS, "required");
    });
    expect(mockSendCalls).toHaveBeenCalledWith(CALLS, {
      strategy: "atomic-batch",
    });
    expect(result.current.lastRoute).toBe("wallet-batch");
  });

  it("sends nothing at all when the requirement cannot be met", async () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    await act(async () => {
      await expect(result.current.execute(CALLS, "required")).rejects.toThrow(
        /cannot execute several calls atomically/,
      );
    });
    expect(mockSendCalls).not.toHaveBeenCalled();
    expect(result.current.lastRoute).toBeNull();
  });

  it("uses the smart account when the wallet cannot batch", async () => {
    withAtomic("unsupported");
    const userOperation = vi.fn(async () => "0xuserop");
    const { result } = renderHook(() => useExecuteCalls({ userOperation }));
    let hash = "";
    await act(async () => {
      hash = await result.current.execute(CALLS, "required");
    });
    expect(userOperation).toHaveBeenCalledWith(CALLS);
    expect(mockSendCalls).not.toHaveBeenCalled();
    expect(hash).toBe("0xuserop");
  });

  it("falls back to sequential when the caller accepts it", async () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    await act(async () => {
      await result.current.execute(CALLS, "preferred");
    });
    expect(mockSendCalls).toHaveBeenCalledWith(CALLS, {
      strategy: "sequential",
    });
    expect(result.current.lastRoute).toBe("sequential");
  });

  it("executes the promised batch when capability discovery was unavailable", async () => {
    withAtomic("unknown");
    const { result } = renderHook(() => useExecuteCalls());
    await act(async () => {
      await result.current.execute(CALLS, "required");
    });
    expect(mockSendCalls).toHaveBeenCalledWith(CALLS, {
      strategy: "atomic-batch",
    });
  });

  it("surfaces an executor failure rather than swallowing it", async () => {
    withAtomic("supported");
    mockSendCalls.mockRejectedValue(new Error("user rejected"));
    const { result } = renderHook(() => useExecuteCalls());
    await act(async () => {
      await expect(result.current.execute(CALLS)).rejects.toThrow(
        "user rejected",
      );
    });
    expect(result.current.error?.message).toBe("user rejected");
  });
});

describe("useExecuteCalls — sponsorship and delegation", () => {
  it("refuses when sponsored gas is required and unavailable", () => {
    withAtomic("supported");
    const { result } = renderHook(() =>
      useExecuteCalls({ sponsorship: "required" }),
    );
    const plan = result.current.preview(2, "required");
    expect(plan.route).toBeNull();
    expect(plan.reason).toMatch(/no paymaster/);
  });

  it("does not promise sponsorship from capability plus URL alone", () => {
    mockUseCapabilities.mockReturnValue({
      atomic: "supported",
      current: {
        raw: { paymasterService: { supported: true } },
      },
    });
    const { result } = renderHook(() =>
      useExecuteCalls({
        sponsorship: "required",
        paymasterService: { url: "https://paymaster.example" },
      }),
    );
    const plan = result.current.preview(2, "required");
    expect(plan.route).toBeNull();
    expect(plan.sponsored).toBe(false);
  });

  it("does not mistake advertised paymaster support for active sponsorship", () => {
    mockUseCapabilities.mockReturnValue({
      atomic: "supported",
      current: {
        raw: { paymasterService: { supported: true } },
      },
    });
    const { result } = renderHook(() =>
      useExecuteCalls({ sponsorship: "required" }),
    );
    expect(result.current.preview(2, "required").route).toBeNull();
  });

  it("passes the executable paymaster service to the wallet batch", async () => {
    mockUseCapabilities.mockReturnValue({
      atomic: "supported",
      current: {
        raw: { paymasterService: { supported: true } },
      },
    });
    const paymasterService = {
      url: "https://paymaster.example",
      context: { mode: "sponsor" },
    };
    const { result } = renderHook(() =>
      useExecuteCalls({ sponsorship: "preferred", paymasterService }),
    );
    await act(async () => {
      await result.current.execute(CALLS, "required");
    });
    expect(mockSendCalls).toHaveBeenCalledWith(CALLS, {
      strategy: "atomic-batch",
      paymasterService,
    });
  });

  it("refuses sponsorship when the only wallet route is sequential", () => {
    mockUseCapabilities.mockReturnValue({
      atomic: "unsupported",
      current: {
        raw: { paymasterService: { supported: true } },
      },
    });
    const { result } = renderHook(() =>
      useExecuteCalls({
        sponsorship: "required",
        paymasterService: { url: "https://paymaster.example" },
      }),
    );
    const plan = result.current.preview(2, "preferred");
    expect(plan.route).toBeNull();
    expect(plan.sponsored).toBe(false);
    expect(plan.reason).toMatch(/no executable sponsored route/);
  });

  it("does not let a UserOperation bypass required sponsorship", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() =>
      useExecuteCalls({
        sponsorship: "required",
        userOperation: async () => "0xuserop",
      }),
    );
    expect(result.current.preview(2, "required").route).toBeNull();
  });

  it("accepts an explicitly sponsored UserOperation executor", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() =>
      useExecuteCalls({
        sponsorship: "required",
        userOperation: async () => "0xuserop",
        userOperationSponsored: true,
      }),
    );
    const plan = result.current.preview(2, "required");
    expect(plan.route).toBe("user-operation");
    expect(plan.sponsored).toBe(true);
  });

  it("does not mention sponsorship when it was not asked for", () => {
    withAtomic("supported");
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(2, "required").route).toBe("wallet-batch");
  });

  // Delegation is evidence about the account, not about the wallet's RPC
  // surface. It must not turn a wallet that cannot be asked to batch into one
  // that can — only explain the difference.
  it("reports a delegated account without upgrading the route", () => {
    withAtomic("unsupported");
    mockUseDelegation.mockReturnValue({
      delegated: true,
      delegate: "0xabc",
    });
    const { result } = renderHook(() => useExecuteCalls());
    const plan = result.current.preview(2, "preferred");
    expect(plan.route).toBe("sequential");
    expect(plan.atomic).toBe(false);
    expect(plan.reason).toMatch(/does delegate to 0xabc/);
  });

  it("says nothing about delegation when the wallet already batches", () => {
    withAtomic("supported");
    mockUseDelegation.mockReturnValue({
      delegated: true,
      delegate: "0xabc",
    });
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(2).reason).not.toMatch(/delegate/);
  });

  it("says nothing when delegation was never read", () => {
    withAtomic("unsupported");
    const { result } = renderHook(() => useExecuteCalls());
    expect(result.current.preview(2, "preferred").reason).not.toMatch(
      /delegate/,
    );
  });
});
