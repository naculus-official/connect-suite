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
 * The namespace surface, which is what makes the engine's dual-account support
 * reachable from an app.
 *
 * The failure worth guarding is quiet: the connector mutates the wallet record
 * in place, so a switch that does not publish a new object leaves React
 * showing the previous address while signing happens on the new one. A user
 * acts on the address they can see.
 */

const EVM = {
  namespace: "eip155" as const,
  privateKey: `0x${"11".repeat(32)}`,
  address: "0x9858eFFd232B4033E47d90003D41EC34EcaEda94",
  derivationPath: "m/44'/60'/0'/0/0",
};
const SOL = {
  namespace: "solana" as const,
  privateKey: `0x${"22".repeat(32)}`,
  address: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
  derivationPath: "m/44'/501'/0'/0'",
};

function connectorWith(accounts = [EVM, SOL]) {
  const record = {
    mnemonic: "phrase",
    accounts: [...accounts],
    activeNamespace: accounts[0].namespace,
    createdAt: 0,
    version: 2 as const,
    get address() {
      return this.accounts.find(
        (a: { namespace: string }) => a.namespace === this.activeNamespace,
      )?.address;
    },
  };
  const connector = {
    getWallet: () => record,
    accounts: () => record.accounts,
    account: (ns: string) =>
      record.accounts.find((a) => a.namespace === ns) ?? null,
    setActiveNamespace: vi.fn((ns: string) => {
      if (!record.accounts.some((a) => a.namespace === ns)) {
        throw new Error(`This wallet holds no ${ns} account.`);
      }
      record.activeNamespace = ns as typeof record.activeNamespace;
    }),
    backfillAccounts: vi.fn(async (): Promise<Array<typeof EVM | typeof SOL>> => []),
    generateWallet: vi.fn(async () => record),
    getStorageSecurityLevel: () => 1,
  };
  mockResolveClient.mockReturnValue({ embeddedConnector: connector });
  mockUseWeb3.mockReturnValue({ connectEmbedded: vi.fn(), client: {} });
  return { connector, record };
}

beforeEach(() => vi.clearAllMocks());

describe("useEmbeddedWallet — namespaces", () => {
  it("exposes nothing before a wallet exists", () => {
    connectorWith();
    const { result } = renderHook(() => useEmbeddedWallet());
    expect(result.current.accounts).toEqual([]);
    expect(result.current.activeNamespace).toBeNull();
    expect(result.current.address).toBeNull();
  });

  it("lists every account once a wallet is loaded", async () => {
    connectorWith();
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    expect(result.current.accounts.map((a) => a.namespace)).toEqual([
      "eip155",
      "solana",
    ]);
    expect(result.current.activeNamespace).toBe("eip155");
    expect(result.current.address).toBe(EVM.address);
  });

  it("publishes the new address after switching", async () => {
    // The quiet failure: the record is mutated in place, so without a fresh
    // object React keeps rendering the old address while signing moves.
    connectorWith();
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });

    act(() => result.current.setActiveNamespace("solana"));

    expect(result.current.activeNamespace).toBe("solana");
    expect(result.current.address).toBe(SOL.address);
  });

  it("switches back", async () => {
    connectorWith();
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    act(() => result.current.setActiveNamespace("solana"));
    act(() => result.current.setActiveNamespace("eip155"));
    expect(result.current.address).toBe(EVM.address);
  });

  it("refuses a namespace this wallet has no account for", async () => {
    // A wallet imported from a raw key holds one namespace. Pointing it at the
    // other would leave it addressing nothing.
    connectorWith([EVM]);
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    expect(() => result.current.setActiveNamespace("solana")).toThrow(
      /holds no solana account/,
    );
    expect(result.current.address).toBe(EVM.address);
  });

  it("publishes accounts added by a backfill", async () => {
    const { connector, record } = connectorWith([EVM]);
    connector.backfillAccounts = vi.fn(async () => {
      record.accounts.push(SOL);
      return [SOL];
    });
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    expect(result.current.accounts).toHaveLength(1);

    await act(async () => {
      await result.current.backfillAccounts();
    });
    expect(result.current.accounts.map((a) => a.namespace)).toEqual([
      "eip155",
      "solana",
    ]);
  });

  it("leaves the active namespace alone when backfilling", async () => {
    // Shown, not switched to. Someone who had an Ethereum wallet yesterday
    // should not find themselves on Solana today.
    const { connector, record } = connectorWith([EVM]);
    connector.backfillAccounts = vi.fn(async () => {
      record.accounts.push(SOL);
      return [SOL];
    });
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    await act(async () => {
      await result.current.backfillAccounts();
    });
    expect(result.current.activeNamespace).toBe("eip155");
    expect(result.current.address).toBe(EVM.address);
  });

  it("does not re-render for a backfill that added nothing", async () => {
    const { connector } = connectorWith();
    const { result } = renderHook(() => useEmbeddedWallet());
    await act(async () => {
      await result.current.generateWallet();
    });
    const before = result.current.wallet;

    await act(async () => {
      expect(await result.current.backfillAccounts()).toEqual([]);
    });
    expect(result.current.wallet).toBe(before);
    expect(connector.backfillAccounts).toHaveBeenCalled();
  });
});
