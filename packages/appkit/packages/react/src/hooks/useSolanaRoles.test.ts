/// <reference types="vitest" />
/// @vitest-environment jsdom

import type { SolanaRoles } from "@naculus/connect-appkit-core";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));
const mockResolveClient = vi.fn();
vi.mock("./client-resolver", () => ({
  resolveClient: (c: unknown) => mockResolveClient(c),
}));

import { useSolanaRoles } from "./useSolanaRoles";

const ADDRESS = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
const CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_SESSION = { id: "solana:s1", walletType: "solana" };
const ACCOUNTS = [`${CHAIN}:${ADDRESS}`];

function rolesFor(overrides: Partial<SolanaRoles> = {}): SolanaRoles {
  const identity = { address: ADDRESS, chain: CHAIN };
  return {
    identity,
    signer: { ...identity, signTransaction: vi.fn() },
    payer: { ...identity, signAndSendTransaction: vi.fn() },
    features: {
      signMessage: true,
      signTransaction: true,
      signAllTransactions: false,
      signAndSendTransaction: true,
    },
    ...overrides,
  };
}

function setup(
  solanaConnector: unknown,
  { session = SOLANA_SESSION as unknown, accounts = ACCOUNTS } = {},
) {
  const client = {};
  mockUseWeb3.mockReturnValue({ client, session, accounts });
  mockResolveClient.mockReturnValue({ solanaConnector });
}

beforeEach(() => vi.clearAllMocks());

describe("useSolanaRoles", () => {
  it("exposes the roles the connector reports, unwrapped", () => {
    const roles = rolesFor();
    setup({ getRoles: vi.fn(() => roles) });

    const { result } = renderHook(() => useSolanaRoles());

    expect(result.current.roles).toBe(roles);
    expect(result.current.absence).toBeNull();
    expect(result.current.identity).toEqual({ address: ADDRESS, chain: CHAIN });
    expect(result.current.signer).toBe(roles.signer);
    expect(result.current.payer).toBe(roles.payer);
  });

  /**
   * The case the whole role split exists for: a send-only wallet is connected
   * and reports `signer: null`. `absence` stays null because that is an
   * answer, not the lack of one.
   */
  it("reports a send-only wallet as payer without signer, with no absence", () => {
    setup({ getRoles: () => rolesFor({ signer: null }) });

    const { result } = renderHook(() => useSolanaRoles());

    expect(result.current.signer).toBeNull();
    expect(result.current.payer).not.toBeNull();
    expect(result.current.absence).toBeNull();
  });

  it("says no_session when nothing is connected", () => {
    setup({ getRoles: vi.fn() }, { session: null, accounts: [] });

    const { result } = renderHook(() => useSolanaRoles());

    expect(result.current).toEqual({
      roles: null,
      absence: "no_session",
      identity: null,
      signer: null,
      payer: null,
    });
  });

  it("says not_solana for an EVM session, without asking the connector", () => {
    const getRoles = vi.fn(() => rolesFor());
    setup(
      { getRoles },
      {
        session: { id: "wc:s2", walletType: "walletconnect" },
        accounts: ["eip155:1:0x1111111111111111111111111111111111111111"],
      },
    );

    const { result } = renderHook(() => useSolanaRoles());

    expect(result.current.absence).toBe("not_solana");
    expect(getRoles).not.toHaveBeenCalled();
  });

  /**
   * An older `@naculus/connector-solana` has no `getRoles`. That is not a
   * wallet that cannot sign; it is one that has not been asked, and the UI
   * must not show a "cannot sign" state for it.
   */
  it("says unreported when the connector lacks getRoles", () => {
    setup({});
    expect(renderHook(() => useSolanaRoles()).result.current.absence).toBe(
      "unreported",
    );

    setup(null);
    expect(renderHook(() => useSolanaRoles()).result.current.absence).toBe(
      "unreported",
    );
  });

  /**
   * The connector mutates the session in place on an in-wallet account
   * switch, so the session reference does not change. The hook has to
   * re-read on `accounts` or `identity.address` stays on the old account.
   */
  it("re-reads the roles when the accounts change under the same session", () => {
    const next = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    let address = ADDRESS;
    const getRoles = vi.fn(() =>
      rolesFor({ identity: { address, chain: CHAIN } }),
    );
    const client = {};
    mockResolveClient.mockReturnValue({ solanaConnector: { getRoles } });
    mockUseWeb3.mockReturnValue({
      client,
      session: SOLANA_SESSION,
      accounts: ACCOUNTS,
    });

    const { result, rerender } = renderHook(() => useSolanaRoles());
    expect(result.current.identity?.address).toBe(ADDRESS);

    address = next;
    mockUseWeb3.mockReturnValue({
      client,
      session: SOLANA_SESSION,
      accounts: [`${CHAIN}:${next}`],
    });
    rerender();

    expect(result.current.identity?.address).toBe(next);
    expect(getRoles).toHaveBeenCalledTimes(2);
  });

  it("does not re-read on a render where nothing changed", () => {
    const getRoles = vi.fn(() => rolesFor());
    setup({ getRoles });

    const { rerender } = renderHook(() => useSolanaRoles());
    rerender();

    expect(getRoles).toHaveBeenCalledTimes(1);
  });
});
