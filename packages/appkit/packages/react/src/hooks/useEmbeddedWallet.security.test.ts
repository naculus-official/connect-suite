/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));

const mockResolveClient = vi.fn();
vi.mock("./client-resolver", () => ({
  resolveClient: (c: unknown) => mockResolveClient(c),
}));

import { useEmbeddedWallet } from "./useEmbeddedWallet";

/**
 * The storage security report, which is what a security panel renders.
 *
 * The connector builds a fresh object on every call. Handing that straight to
 * consumers would give a new identity on every render, so anything using it as
 * an effect dependency would loop forever. The identity guarantee is the part
 * worth pinning.
 */

const REPORT = {
  level: 1,
  score: 95,
  backend: "indexedDb" as const,
  encrypted: true,
  unlock: { prf: "available" as const, sealedWith: ["prf", "passphrase"] },
  findings: [
    {
      id: "passphrase-recovery-retained",
      severity: "info" as const,
      deduction: 5,
      title: "A passphrase can still open this wallet",
      detail: "...",
    },
  ],
};

function connectorReporting(
  build: () => unknown | null,
  extra: Record<string, unknown> = {},
) {
  const connector = {
    getWallet: () => null,
    accounts: () => [],
    getStorageSecurityLevel: () => 1,
    // Fresh object each call, exactly like the real one.
    getStorageSecurityReport: vi.fn(() => build()),
    ...extra,
  };
  mockResolveClient.mockReturnValue({ embeddedConnector: connector });
  mockUseWeb3.mockReturnValue({ connectEmbedded: vi.fn(), client: {} });
  return connector;
}

beforeEach(() => vi.clearAllMocks());

describe("useEmbeddedWallet — security report", () => {
  it("passes the report through", () => {
    connectorReporting(() => structuredClone(REPORT));
    const { result } = renderHook(() => useEmbeddedWallet());
    expect(result.current.securityReport).toEqual(REPORT);
  });

  it("keeps one object identity while the content is unchanged", () => {
    connectorReporting(() => structuredClone(REPORT));
    const { result, rerender } = renderHook(() => useEmbeddedWallet());
    const first = result.current.securityReport;
    rerender();
    rerender();
    expect(result.current.securityReport).toBe(first);
  });

  it("publishes a new object when the content actually changes", () => {
    let score = 95;
    connectorReporting(() => ({ ...structuredClone(REPORT), score }));
    const { result, rerender } = renderHook(() => useEmbeddedWallet());
    const first = result.current.securityReport;
    score = 100;
    rerender();
    expect(result.current.securityReport).not.toBe(first);
    expect(result.current.securityReport?.score).toBe(100);
  });

  // Before a wallet exists the storage backend has not been chosen, so there
  // is nothing to assess. A fabricated worst-case report would warn about a
  // state that has not happened.
  it("reports null rather than a worst case before a wallet exists", () => {
    connectorReporting(() => null);
    const { result } = renderHook(() => useEmbeddedWallet());
    expect(result.current.securityReport).toBeNull();
  });

  it("reports null when the embedded wallet is not enabled at all", () => {
    mockResolveClient.mockReturnValue(null);
    mockUseWeb3.mockReturnValue({ connectEmbedded: vi.fn(), client: {} });
    const { result } = renderHook(() => useEmbeddedWallet());
    expect(result.current.securityReport).toBeNull();
    expect(result.current.storageSecurityLevel).toBe(4);
  });

  // An older connector build has no such method.
  it("reports null when the connector cannot produce a report", () => {
    const connector = {
      getWallet: () => null,
      accounts: () => [],
      getStorageSecurityLevel: () => 2,
    };
    mockResolveClient.mockReturnValue({ embeddedConnector: connector });
    mockUseWeb3.mockReturnValue({ connectEmbedded: vi.fn(), client: {} });
    const { result } = renderHook(() => useEmbeddedWallet());
    expect(result.current.securityReport).toBeNull();
    expect(result.current.storageSecurityLevel).toBe(2);
  });

  it("drops the cached object once the report goes away", async () => {
    let present = true;
    connectorReporting(() => (present ? structuredClone(REPORT) : null));
    const { result, rerender } = renderHook(() => useEmbeddedWallet());
    expect(result.current.securityReport).not.toBeNull();
    present = false;
    await act(async () => {
      rerender();
    });
    expect(result.current.securityReport).toBeNull();
  });

  it("keeps the confirmed storage tier after the connector session disconnects", async () => {
    let connectorHasWallet = true;
    const walletData = {
      address: "0x1234567890abcdef1234567890abcdef12345678",
      mnemonic: "test wallet phrase",
      accounts: [],
      activeNamespace: "eip155",
    };
    connectorReporting(() => null, {
      generateWallet: vi.fn(async () => walletData),
      getWallet: () => (connectorHasWallet ? walletData : null),
      getStorageSecurityLevel: () => (connectorHasWallet ? 2 : 4),
    });
    const { result, rerender } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.generateWallet();
    });
    expect(result.current.storageSecurityLevel).toBe(2);

    connectorHasWallet = false;
    rerender();
    expect(result.current.hasWallet).toBe(true);
    expect(result.current.storageSecurityLevel).toBe(2);
  });
});
