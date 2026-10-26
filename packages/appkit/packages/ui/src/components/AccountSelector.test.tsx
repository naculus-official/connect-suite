/// <reference types="vitest" />
/// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

vi.mock("@naculus/connect-appkit-react", () => ({
  useEmbeddedWallet: () => state.value,
}));

import { AccountSelector } from "./AccountSelector";

const EVM = {
  namespace: "eip155" as const,
  address: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
  derivationPath: "m/44'/60'/0'/0/0",
};
const SOL = {
  namespace: "solana" as const,
  address: "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW",
  derivationPath: "m/44'/501'/0'/0'",
};

function setup(overrides: Record<string, unknown> = {}) {
  const setActiveNamespace = vi.fn();
  const backfillAccounts = vi.fn(async () => []);
  state.value = {
    wallet: { recoveryAvailable: true, accounts: [EVM, SOL] },
    accounts: [EVM, SOL],
    activeNamespace: "eip155",
    setActiveNamespace,
    backfillAccounts,
    ...overrides,
  };
  return { setActiveNamespace, backfillAccounts };
}

describe("AccountSelector", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders nothing without an embedded wallet", () => {
    setup({ wallet: null, accounts: [] });
    const { container } = render(<AccountSelector />);
    expect(container.firstChild).toBeNull();
  });

  it("lists every account the wallet holds", () => {
    setup();
    render(<AccountSelector />);
    expect(screen.getByText("Ethereum & EVM")).toBeDefined();
    expect(screen.getByText("Solana")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Copy Ethereum & EVM address" })
        .className,
    ).toContain("naculus-hit-target");
  });

  it("marks only the active account as checked", () => {
    setup();
    render(<AccountSelector />);
    const rows = screen.getAllByRole("radio");
    expect(rows[0].getAttribute("aria-checked")).toBe("true");
    expect(rows[1].getAttribute("aria-checked")).toBe("false");
  });

  // A prefix alone is what an address-poisoning attack needs to look right.
  it("shows both ends of an address, never just the prefix", () => {
    setup();
    render(<AccountSelector />);
    expect(screen.getByText("0x9858...da94")).toBeDefined();
    expect(screen.getByText("HAgk14...XfBW")).toBeDefined();
  });

  it("switches the signing account on click", () => {
    const { setActiveNamespace } = setup();
    render(<AccountSelector />);
    fireEvent.click(screen.getByText("Solana"));
    expect(setActiveNamespace).toHaveBeenCalledWith("solana");
  });

  it("does not re-select the account that is already active", () => {
    const { setActiveNamespace } = setup();
    render(<AccountSelector />);
    fireEvent.click(screen.getByText("Ethereum & EVM"));
    expect(setActiveNamespace).not.toHaveBeenCalled();
  });

  it("surfaces a refused switch instead of failing silently", () => {
    const { setActiveNamespace } = setup();
    setActiveNamespace.mockImplementation(() => {
      throw new Error("This wallet holds no solana account.");
    });
    render(<AccountSelector />);
    fireEvent.click(screen.getByText("Solana"));
    expect(screen.getByRole("alert").textContent).toContain(
      "holds no solana account",
    );
  });

  it("offers to derive missing accounts when the phrase can produce them", () => {
    setup({ accounts: [EVM] });
    render(<AccountSelector />);
    expect(
      screen.getByText("Show accounts this phrase already owns"),
    ).toBeDefined();
  });

  // A raw private key is on exactly one curve. There is no second account to
  // derive, so offering one would promise a key that cannot exist.
  it("hides the derive affordance for a wallet imported from a raw key", () => {
    setup({
      wallet: { recoveryAvailable: false, accounts: [EVM] },
      accounts: [EVM],
    });
    render(<AccountSelector />);
    expect(
      screen.queryByText("Show accounts this phrase already owns"),
    ).toBeNull();
  });

  it("hides the derive affordance once both accounts exist", () => {
    setup();
    render(<AccountSelector />);
    expect(
      screen.queryByText("Show accounts this phrase already owns"),
    ).toBeNull();
  });

  it("reports a failed derivation", async () => {
    const { backfillAccounts } = setup({ accounts: [EVM] });
    backfillAccounts.mockRejectedValue(new Error("No wallet loaded."));
    render(<AccountSelector />);
    fireEvent.click(screen.getByText("Show accounts this phrase already owns"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "No wallet loaded.",
      ),
    );
  });

  it("says the choice is about the signing key, not the network", () => {
    setup();
    render(<AccountSelector />);
    expect(
      screen.getByText("Chooses the signing key, not the network"),
    ).toBeDefined();
  });
});
