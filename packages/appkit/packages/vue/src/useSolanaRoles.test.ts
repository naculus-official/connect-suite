import type { SolanaRoles } from "@naculus/connect-appkit-core";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSolanaRoles } from "./useSolanaRoles";

const ADDRESS = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
const CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_SESSION = { id: "solana:s1", walletType: "solana" };
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

describe("useSolanaRoles (Vue)", () => {
  it("exposes the roles the connector reports, unwrapped", () => {
    const roles = rolesFor();
    const {
      roles: out,
      absence,
      identity,
      signer,
      payer,
    } = useSolanaRoles({ getRoles: () => roles }, SOLANA_SESSION);

    expect(out.value).toBe(roles);
    expect(absence.value).toBeNull();
    expect(identity.value).toEqual({ address: ADDRESS, chain: CHAIN });
    expect(signer.value).toBe(roles.signer);
    expect(payer.value).toBe(roles.payer);
  });

  it("reports a send-only wallet as payer without signer, with no absence", () => {
    const { signer, payer, absence } = useSolanaRoles(
      { getRoles: () => rolesFor({ signer: null }) },
      SOLANA_SESSION,
    );

    expect(signer.value).toBeNull();
    expect(payer.value).not.toBeNull();
    expect(absence.value).toBeNull();
  });

  it("says no_session when nothing is connected", () => {
    const { roles, absence } = useSolanaRoles({ getRoles: vi.fn() }, null);

    expect(roles.value).toBeNull();
    expect(absence.value).toBe("no_session");
  });

  it("says not_solana for an EVM session, without asking the connector", () => {
    const getRoles = vi.fn(() => rolesFor());
    const { absence } = useSolanaRoles({ getRoles }, EVM_SESSION);

    expect(absence.value).toBe("not_solana");
    expect(getRoles).not.toHaveBeenCalled();
  });

  it("says unreported when the connector lacks getRoles", () => {
    expect(useSolanaRoles({}, SOLANA_SESSION).absence.value).toBe("unreported");
    expect(useSolanaRoles(null, SOLANA_SESSION).absence.value).toBe(
      "unreported",
    );
  });

  /** A ref for the session is the reactivity contract: replace it, roles follow. */
  it("follows the session ref from no session to connected and back", () => {
    const session = ref<{ walletType?: string } | null>(null);
    const { absence, roles } = useSolanaRoles(
      { getRoles: () => rolesFor() },
      session,
    );
    expect(absence.value).toBe("no_session");

    session.value = SOLANA_SESSION;
    expect(absence.value).toBeNull();
    expect(roles.value?.identity.address).toBe(ADDRESS);

    session.value = null;
    expect(roles.value).toBeNull();
    expect(absence.value).toBe("no_session");
  });

  it("follows the connector ref when it arrives after a lazy import", () => {
    const connector = ref<{ getRoles?: () => SolanaRoles | null } | null>(null);
    const { absence } = useSolanaRoles(connector, SOLANA_SESSION);
    expect(absence.value).toBe("unreported");

    connector.value = { getRoles: () => rolesFor() };
    expect(absence.value).toBeNull();
  });
});
