import type { UniversalWalletSession } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { findX402Provider, resolveX402Wallet } from "./x402-wallet";

const provider = { request: vi.fn() };

function session(
  overrides: Partial<UniversalWalletSession> = {},
): UniversalWalletSession {
  return {
    id: "eip6963-wallet-1",
    walletId: "wallet-1",
    walletType: "eip6963",
    namespaces: {
      eip155: {
        chains: ["eip155:1"],
        accounts: ["eip155:1:0x1111111111111111111111111111111111111111"],
        methods: ["eth_signTypedData_v4"],
        events: [],
      },
    },
    platform: "desktop-web",
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveX402Wallet", () => {
  it("reports no-session", () => {
    expect(resolveX402Wallet(null, provider)).toEqual({
      provider: null,
      address: null,
      reason: "no-session",
    });
  });

  it("reports not-evm", () => {
    expect(
      resolveX402Wallet(
        session({
          walletType: "solana",
          namespaces: {
            solana: { chains: [], accounts: [], methods: [], events: [] },
          },
        }),
        provider,
      ),
    ).toMatchObject({ reason: "not-evm" });
  });

  it("reports unsupported-wallet-type", () => {
    expect(
      resolveX402Wallet(
        session({ walletType: "embedded", id: "embedded" }),
        provider,
      ),
    ).toMatchObject({ reason: "unsupported-wallet-type" });
  });

  it("resolves an EIP-6963 provider and payer", () => {
    expect(resolveX402Wallet(session(), provider)).toEqual({
      provider,
      address: "0x1111111111111111111111111111111111111111",
      reason: null,
    });
  });
});

describe("findX402Provider", () => {
  const injectedProvider = { request: async () => null };
  const wcProvider = { request: async () => null };
  const base = {
    namespaces: {
      eip155: { chains: ["eip155:1"], accounts: [], methods: [], events: [] },
    },
  };

  it("picks the injected wallet the session was made with", () => {
    const session = {
      ...base,
      id: "eip6963-io.metamask-1",
      walletType: "eip6963",
      walletId: "io.metamask",
    } as never;
    expect(
      findX402Provider(session, {
        injected: [
          { id: "io.rabby", provider: { request: async () => null } },
          { id: "io.metamask", provider: injectedProvider },
        ],
        walletConnect: wcProvider,
      }),
    ).toBe(injectedProvider);
  });

  it("uses the WalletConnect connector for a WalletConnect session", () => {
    const session = {
      ...base,
      id: "wc-1",
      walletType: "walletconnect",
    } as never;
    expect(
      findX402Provider(session, { injected: [], walletConnect: wcProvider }),
    ).toBe(wcProvider);
  });

  it("returns null for other wallet types, a missing wallet, or no session", () => {
    expect(findX402Provider(null, {})).toBeNull();
    expect(
      findX402Provider(
        { ...base, id: "embedded-1", walletType: "embedded" } as never,
        { walletConnect: wcProvider },
      ),
    ).toBeNull();
    expect(
      findX402Provider(
        {
          ...base,
          id: "eip6963-x-1",
          walletType: "eip6963",
          walletId: "gone",
        } as never,
        { injected: [] },
      ),
    ).toBeNull();
  });
});
