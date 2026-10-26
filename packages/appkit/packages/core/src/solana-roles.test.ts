import { describe, expect, it, vi } from "vitest";
import { readSolanaRoles, type SolanaRoles } from "./solana-roles";

const ADDRESS = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
const CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SESSION = { id: "solana:s1", walletType: "solana" };
const EVM_SESSION = { id: "wc:s2", walletType: "walletconnect" };

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

describe("readSolanaRoles", () => {
  it("hands back what the connector reports, unchanged", () => {
    const roles = rolesFor();
    const connector = { getRoles: vi.fn(() => roles) };

    const state = readSolanaRoles(connector, SESSION);

    expect(state).toEqual({ roles, absence: null });
    expect(state.roles).toBe(roles);
    expect(connector.getRoles).toHaveBeenCalledWith(SESSION);
  });

  /**
   * A null role from the connector is the answer, not an absence. The whole
   * point of the split is that a send-only wallet reports `signer: null`
   * while still being connected.
   */
  it("keeps a null signer as a reported answer, not an absence", () => {
    const roles = rolesFor({ signer: null });
    const state = readSolanaRoles({ getRoles: () => roles }, SESSION);

    expect(state.absence).toBeNull();
    expect(state.roles?.signer).toBeNull();
    expect(state.roles?.payer).not.toBeNull();
  });

  it("says no_session when nothing is connected", () => {
    const getRoles = vi.fn();
    expect(readSolanaRoles({ getRoles }, null)).toEqual({
      roles: null,
      absence: "no_session",
    });
    expect(getRoles).not.toHaveBeenCalled();
  });

  it("says no_session when the connector has no live session for the one held", () => {
    const state = readSolanaRoles({ getRoles: () => null }, SESSION);
    expect(state).toEqual({ roles: null, absence: "no_session" });
  });

  /**
   * An EVM session is not a Solana wallet that cannot sign. Asking the Solana
   * connector about it would report the previous Solana account, if any,
   * which is the wrong wallet entirely.
   */
  it("says not_solana for another namespace without asking the connector", () => {
    const getRoles = vi.fn(() => rolesFor());
    const state = readSolanaRoles({ getRoles }, EVM_SESSION);

    expect(state).toEqual({ roles: null, absence: "not_solana" });
    expect(getRoles).not.toHaveBeenCalled();
  });

  /**
   * The case a second implementation would most likely collapse into
   * `no_session`. A connector without `getRoles` has not said the wallet
   * cannot sign; it has said nothing.
   */
  it("says unreported when the connector has no getRoles", () => {
    expect(readSolanaRoles({}, SESSION)).toEqual({
      roles: null,
      absence: "unreported",
    });
    expect(readSolanaRoles(null, SESSION)).toEqual({
      roles: null,
      absence: "unreported",
    });
  });
});
