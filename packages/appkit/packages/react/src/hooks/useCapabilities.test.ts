/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));
const mockResolveClient = vi.fn();
vi.mock("./client-resolver", () => ({
  resolveClient: (c: unknown) => mockResolveClient(c),
}));

import { useCapabilities } from "./useCapabilities";

const SESSION = { id: "s1", walletType: "walletconnect" };

function setup(
  getCapabilities: unknown,
  { chainId = "eip155:1", session = SESSION } = {},
) {
  mockUseWeb3.mockReturnValue({ client: {}, session, chainId });
  mockResolveClient.mockReturnValue(getCapabilities ? { getCapabilities } : {});
}

beforeEach(() => vi.clearAllMocks());

describe("useCapabilities", () => {
  it("reports atomic support the wallet declares (2.0.0 shape)", async () => {
    setup(
      vi.fn(async () => ({ "eip155:1": { atomic: { status: "supported" } } })),
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.atomic).toBe("supported");
  });

  it("treats ready as a yes, because it is one after a user action", async () => {
    setup(vi.fn(async () => ({ "eip155:1": { atomic: { status: "ready" } } })));
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.atomic).toBe("supported"));
  });

  it("reads the legacy atomicBatch shape and its batch size", async () => {
    setup(
      vi.fn(async () => ({
        "eip155:1": { atomicBatch: { supported: true, maxBatchSize: 5 } },
      })),
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.atomic).toBe("supported"));
    expect(result.current.current?.maxBatchSize).toBe(5);
  });

  it("reads a declared no as unsupported", async () => {
    setup(
      vi.fn(async () => ({
        "eip155:1": { atomic: { status: "unsupported" } },
      })),
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.atomic).toBe("unsupported");
  });

  // EIP-5792 is explicit that absence is not a denial. Collapsing it to false
  // sends every silent wallet down the sequential path, which is the one where
  // an approve lands and the swap it was for fails.
  it("does not turn silence into a no", async () => {
    setup(vi.fn(async () => ({})));
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(result.current.atomic).toBe("unknown");
  });

  it("is unknown for a wallet that does not implement the method", async () => {
    setup(null);
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.atomic).toBe("unknown"));
    expect(result.current.capabilities).toBeNull();
  });

  it("is unknown, not unsupported, when the query fails", async () => {
    setup(
      vi.fn(async () => {
        throw new Error("wallet refused");
      }),
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.atomic).toBe("unknown");
    expect(result.current.capabilities).toBeNull();
  });

  it("asks nothing without a session", async () => {
    const getCapabilities = vi.fn();
    setup(getCapabilities, { session: null as never });
    renderHook(() => useCapabilities());
    await waitFor(() => expect(getCapabilities).not.toHaveBeenCalled());
  });

  // A wallet reached through a custom connector may answer in raw hex.
  it("finds the current chain whether the key is CAIP-2 or hex", async () => {
    setup(
      vi.fn(async () => ({ "0x89": { atomic: { status: "supported" } } })),
      {
        chainId: "eip155:137",
      },
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.atomic).toBe("supported"));
  });

  it("keeps every chain the wallet reported, not just the current one", async () => {
    setup(
      vi.fn(async () => ({
        "eip155:1": { atomic: { status: "supported" } },
        "eip155:137": { atomic: { status: "unsupported" } },
      })),
    );
    const { result } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.capabilities).not.toBeNull());
    expect(Object.keys(result.current.capabilities ?? {})).toHaveLength(2);
    expect(result.current.capabilities?.["eip155:137"].atomic).toBe(
      "unsupported",
    );
  });

  it("does not let a slow response repopulate capabilities after disconnect", async () => {
    let resolveQuery!: (value: Record<string, unknown>) => void;
    const query = new Promise<Record<string, unknown>>((resolve) => {
      resolveQuery = resolve;
    });
    setup(vi.fn(() => query));
    const { result, rerender } = renderHook(() => useCapabilities());
    await waitFor(() => expect(result.current.isFetching).toBe(true));

    setup(null, { session: null as never });
    rerender();
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    await act(async () => {
      resolveQuery({ "eip155:1": { atomic: { status: "supported" } } });
      await query;
    });
    expect(result.current.capabilities).toBeNull();
    expect(result.current.atomic).toBe("unknown");
  });
});
