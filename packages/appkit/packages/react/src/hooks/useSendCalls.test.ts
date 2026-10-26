/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: unknown }) => children,
}));

const mockResolveClient = vi.fn();
vi.mock("./client-resolver", () => ({
  resolveClient: (c: unknown) => mockResolveClient(c),
}));

import { useSendCalls } from "./useSendCalls";

/**
 * EIP-5792 batch calls, previously 0% covered.
 *
 * The refusals are the point: sending a batch with no session, with an empty
 * call list, or through an uninitialized client must fail before anything
 * reaches the wallet, and the hook's status has to end up somewhere a UI can
 * act on rather than staying "awaiting_approval" forever.
 */

const session = {
  topic: "t",
  namespaces: {
    eip155: {
      chains: ["eip155:1"],
      accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
    },
  },
};

const call = {
  to: `0x${"11".repeat(20)}` as `0x${string}`,
  data: "0x" as `0x${string}`,
};
const TX_HASH = `0x${"12".repeat(32)}`;

/** A client that advertises atomic batching unless told otherwise. */
function batchingClient(
  capabilities: Record<string, unknown> = { atomicBatch: { supported: true } },
) {
  const sendCalls = vi.fn(async () => "0xbatch");
  const sendTransaction = vi.fn(async () => TX_HASH);
  const getCallsStatus = vi.fn(async () => ({ status: 200, receipts: [] }));
  const client: Record<string, unknown> = {
    sendCalls,
    sendTransaction,
    getCallsStatus,
    getCapabilities: vi.fn(async () => ({ "eip155:1": capabilities })),
  };
  return { client, sendCalls, sendTransaction, getCallsStatus };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSendCalls", () => {
  it("starts idle", () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null, client: null });
    const { result } = renderHook(() => useSendCalls());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.batchHash).toBeNull();
  });

  it("refuses without an active session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null, client: null });
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.sendCalls([call])).rejects.toThrow(
        /No active session/,
      );
    });
    expect(result.current.status).toBe("failed");
  });

  it("refuses an empty batch", async () => {
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.sendCalls([])).rejects.toThrow(
        /At least one call/,
      );
    });
    expect(result.current.status).toBe("failed");
  });

  it("refuses when the client is not initialized", async () => {
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: null });
    mockResolveClient.mockReturnValue(null);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.sendCalls([call])).rejects.toThrow(
        /Client not initialized/,
      );
    });
    expect(result.current.status).toBe("failed");
  });

  it("reports submitted and exposes the batch handle on success", async () => {
    const { client, sendCalls } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(sendCalls).toHaveBeenCalled();
    expect(result.current.status).toBe("submitted");
    expect(result.current.batchHash).toBe("0xbatch");
    expect(result.current.error).toBeNull();
  });

  it("surfaces a wallet rejection as failed, not stuck awaiting approval", async () => {
    // A UI that never leaves "awaiting_approval" shows a spinner forever.
    const { client } = batchingClient();
    client.sendCalls = vi.fn(async () => {
      throw new Error("User rejected");
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.sendCalls([call, call])).rejects.toThrow(
        /User rejected/,
      );
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.error?.message).toMatch(/User rejected/);
  });
});

/**
 * Capability abstraction (EIP-5792 and whatever replaces it).
 *
 * The hook's contract is "send these calls", not "use wallet_sendCalls". A
 * wallet that cannot batch — which today is most of them — must still get the
 * calls sent, and the caller must be able to tell which guarantee it received,
 * because a sequential send can leave an approve on chain with no swap behind
 * it.
 */
describe("useSendCalls — execution strategy", () => {
  it("batches when the wallet advertises atomic batching", async () => {
    const { client, sendCalls, sendTransaction } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(sendCalls).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(result.current.execution).toBe("atomic-batch");
  });

  it("falls back to sequential sends when the wallet cannot batch", async () => {
    // Before the capability layer this threw. The calls the caller asked for
    // are still sendable one at a time.
    const { client, sendCalls, sendTransaction } = batchingClient({
      atomicBatch: { supported: false },
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call, call]);
    });
    expect(sendCalls).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(3);
    expect(result.current.execution).toBe("sequential");
    expect(result.current.status).toBe("submitted");
  });

  it("normalizes an embedded-wallet transaction result on the sequential path", async () => {
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    client.sendTransaction = vi.fn(async () => ({ hash: TX_HASH }));
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());

    let returned = "";
    await act(async () => {
      returned = await result.current.sendCalls([call]);
    });

    expect(returned).toBe(TX_HASH);
    expect(result.current.batchHash).toBe(TX_HASH);
  });

  it("fails closed when a sequential connector returns no transaction hash", async () => {
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    client.sendTransaction = vi.fn(async () => ({ status: "submitted" }));
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());

    await act(async () => {
      await expect(result.current.sendCalls([call])).rejects.toThrow(
        /valid 32-byte transaction hash/,
      );
    });
    expect(result.current.status).toBe("failed");
  });

  it.each([
    [
      { code: -32603, message: "in-flight transaction limit reached" },
      /in-flight transaction limit reached \(code -32603\)/,
    ],
    [new Error("User rejected"), /User rejected/],
    ["wallet unavailable", /wallet unavailable/],
  ])("preserves a sequential rejection reason", async (rejection, expected) => {
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    client.sendTransaction = vi
      .fn()
      .mockResolvedValueOnce(TX_HASH)
      .mockRejectedValueOnce(rejection);
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());

    await act(async () => {
      await expect(result.current.sendCalls([call, call])).rejects.toThrow(
        expected,
      );
    });
    expect(result.current.error?.message).toMatch(expected);
  });

  it("falls back when the wallet cannot be asked at all", async () => {
    // An older wallet with no getCapabilities is the common case, not an edge.
    const { client, sendCalls, sendTransaction } = batchingClient();
    client.getCapabilities = undefined;
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(sendCalls).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(result.current.execution).toBe("sequential");
  });

  it("honours a preflight decision to try an atomic batch when discovery was unavailable", async () => {
    const { client, sendCalls, sendTransaction } = batchingClient();
    client.getCapabilities = undefined;
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call], {
        strategy: "atomic-batch",
      });
    });
    expect(sendCalls).toHaveBeenCalledWith(session, [call, call], "eip155:1", {
      atomicRequired: true,
    });
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(result.current.execution).toBe("atomic-batch");
  });

  it("does not let a failed capability query take the send down", async () => {
    const { client, sendTransaction } = batchingClient();
    client.getCapabilities = vi.fn(async () => {
      throw new Error("wallet refused");
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("submitted");
  });

  it("sends a lone call directly rather than as a batch of one", async () => {
    // Batching one call buys no atomicity and costs an extra approval screen.
    const { client, sendCalls, sendTransaction } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call]);
    });
    expect(sendCalls).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses rather than splitting past the advertised batch size", async () => {
    // Two batches are not atomic, which was the whole reason to batch.
    const { client, sendCalls, sendTransaction } = batchingClient({
      atomicBatch: { supported: true, maxBatchSize: 2 },
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call, call]);
    });
    expect(sendCalls).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(3);
  });

  it("reports how far a sequential send got before failing", async () => {
    // The approve landed and the swap did not. A bare wallet error hides that.
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    let n = 0;
    client.sendTransaction = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error("out of gas");
      return TX_HASH;
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(
        result.current.sendCalls([call, call, call]),
      ).rejects.toThrow(/Call 2 of 3 failed after 1 already landed/);
    });
    expect(result.current.status).toBe("failed");
  });

  it("refuses to query bundle status for a sequential send", async () => {
    // The stored handle is a transaction hash; wallet_getCallsStatus would
    // reject it with something far less legible than this.
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    await act(async () => {
      await expect(result.current.getCallsStatus()).rejects.toThrow(
        /sent sequentially/,
      );
    });
    expect(client.getCallsStatus).not.toHaveBeenCalled();
  });

  it("still queries bundle status for a real batch", async () => {
    const { client } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    await act(async () => {
      await result.current.getCallsStatus();
    });
    expect(client.getCallsStatus).toHaveBeenCalledWith(session, "0xbatch");
  });

  it("asks about the chain the calls are going to, not the connected one", async () => {
    const getCapabilities = vi.fn(async () => ({
      "eip155:1": { atomicBatch: { supported: true } },
      "eip155:137": { atomicBatch: { supported: false } },
    }));
    const { client, sendCalls, sendTransaction } = batchingClient();
    client.getCapabilities = getCapabilities;
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call], { chainId: "eip155:137" });
    });
    expect(sendCalls).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });

  it("requires atomicity from the wallet on the batch path", async () => {
    // Choosing to batch is a decision that the calls land together. EIP-5792
    // lets the wallet split a batch unless atomicRequired says otherwise, so
    // without the flag the reported "atomic-batch" would not be a guarantee.
    const { client, sendCalls } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(sendCalls).toHaveBeenCalledWith(session, [call, call], "eip155:1", {
      atomicRequired: true,
    });
  });

  it("forwards an ERC-7677 paymaster service on the batch request", async () => {
    const { client, sendCalls } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const paymasterService = {
      url: "https://paymaster.example",
      context: { policy: "daily-limit" },
    };
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call], { paymasterService });
    });
    expect(sendCalls).toHaveBeenCalledWith(session, [call, call], "eip155:1", {
      atomicRequired: true,
      paymasterService,
    });
  });

  it("clears the recorded strategy on reset", async () => {
    const { client } = batchingClient();
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    expect(result.current.execution).toBe("atomic-batch");
    act(() => result.current.reset());
    expect(result.current.execution).toBeNull();
  });
});

describe("useSendCalls — getCallsStatus", () => {
  it("refuses without a session", async () => {
    mockUseWeb3.mockReturnValue({ session: null, chainId: null, client: null });
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.getCallsStatus()).rejects.toThrow(
        /No active session/,
      );
    });
  });

  it("refuses before any batch has been sent", async () => {
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.getCallsStatus()).rejects.toThrow(
        /No bundle hash/,
      );
    });
  });
});

/**
 * wallet_showCallsStatus.
 *
 * A request for the wallet's own UI, not for data. A wallet that refuses, or
 * has no such screen, leaves the bundle exactly as it was — so this reports
 * whether the wallet showed it rather than throwing, which would push callers
 * into surfacing a transaction error for something that is not one.
 */
describe("useSendCalls — showCallsStatus", () => {
  it("asks the wallet to display a real batch", async () => {
    const { client } = batchingClient();
    client.showCallsStatus = vi.fn(async () => {});
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    let shown: boolean | undefined;
    await act(async () => {
      shown = await result.current.showCallsStatus();
    });
    expect(shown).toBe(true);
    expect(client.showCallsStatus).toHaveBeenCalledWith(session, "0xbatch");
  });

  it("reports false instead of throwing when the wallet refuses", async () => {
    const { client } = batchingClient();
    client.showCallsStatus = vi.fn(async () => {
      throw new Error("Method not found");
    });
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    let shown: boolean | undefined;
    await act(async () => {
      shown = await result.current.showCallsStatus();
    });
    expect(shown).toBe(false);
    // The bundle is untouched by a refusal to display it.
    expect(result.current.status).toBe("submitted");
    expect(result.current.error).toBeNull();
  });

  it("reports false when the connector cannot display at all", async () => {
    const { client } = batchingClient();
    client.showCallsStatus = undefined;
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    await act(async () => {
      await expect(result.current.showCallsStatus()).resolves.toBe(false);
    });
  });

  it("refuses for a sequential send, which has no bundle", async () => {
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    client.showCallsStatus = vi.fn(async () => {});
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    await act(async () => {
      await expect(result.current.showCallsStatus()).resolves.toBe(false);
    });
    expect(client.showCallsStatus).not.toHaveBeenCalled();
  });

  it("accepts an explicit handle even after a sequential send", async () => {
    const { client } = batchingClient({ atomicBatch: { supported: false } });
    client.showCallsStatus = vi.fn(async () => {});
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await result.current.sendCalls([call, call]);
    });
    await act(async () => {
      await expect(result.current.showCallsStatus("0xother")).resolves.toBe(
        true,
      );
    });
  });

  it("reports false before anything has been sent", async () => {
    const { client } = batchingClient();
    client.showCallsStatus = vi.fn(async () => {});
    mockUseWeb3.mockReturnValue({ session, chainId: "eip155:1", client: {} });
    mockResolveClient.mockReturnValue(client);
    const { result } = renderHook(() => useSendCalls());
    await act(async () => {
      await expect(result.current.showCallsStatus()).resolves.toBe(false);
    });
  });
});
