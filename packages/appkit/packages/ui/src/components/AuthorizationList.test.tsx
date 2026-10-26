/// <reference types="vitest" />
/// @vitest-environment jsdom

import type { ListedAuthorization } from "@naculus/connect-core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizationList } from "./AuthorizationList";

const entry = {
  keyId: "key-1",
  status: "active",
  enforcer: "evm-session",
  principal: "owner",
  expiresAt: 2_000_000_000,
  grants: [
    {
      asset: "asset",
      recipients: ["0x1111111111111111111111111111111111111111"],
      maxPerPayment: 2n,
      maxTotal: 10n,
      maxCount: 2,
      rails: ["x402-exact"],
    },
  ],
  spent: { asset: 4n },
  flags: [],
  raw: {},
} as unknown as ListedAuthorization;

afterEach(cleanup);

describe("AuthorizationList", () => {
  it("shows empty state", () => {
    render(
      <AuthorizationList
        entries={[]}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("No payment authorizations")).toBeDefined();
  });
  it("renders status and real spent progress", () => {
    render(
      <AuthorizationList
        entries={{ entries: [entry] }}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("active")).toBeDefined();
    expect(screen.getByText("Spent 4 base units")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "40",
    );
    expect(screen.queryByText(/^Up to .* every /)).toBeNull();
    expect(screen.queryByText(/^Limits enforced by/)).toBeNull();
  });
  it("renders periodic limits with per-entry enforcement", () => {
    const periodic = {
      ...entry,
      grants: [
        {
          ...entry.grants[0],
          period: { amount: 3n, seconds: 604_800, start: 1_900_000_000 },
        },
      ],
    } as ListedAuthorization;
    render(
      <AuthorizationList
        entries={[
          periodic,
          { ...periodic, keyId: "key-2" } as ListedAuthorization,
        ]}
        getEnforcement={(authorization) =>
          authorization.keyId === "key-1" ? "device" : "on-chain"
        }
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getAllByText("Up to 3 base units every 1 week")).toHaveLength(
      2,
    );
    expect(screen.getByText("Limits enforced by this device")).toBeDefined();
    expect(screen.getByText("Limits enforced by the blockchain")).toBeDefined();
  });
  it("formats spent and total with the same asset metadata", () => {
    render(
      <AuthorizationList
        entries={[entry]}
        assets={{ asset: { symbol: "USDC", decimals: 1 } }}
        locale="en-US"
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("Spent 0.4 USDC")).toBeDefined();
    expect(screen.getByText("Total 1 USDC")).toBeDefined();
    expect(screen.getByText("EVM session key")).toBeDefined();
  });
  it("warns only for unverified assets and formats their spend in base units", () => {
    const props = {
      entries: [entry],
      assets: { asset: { symbol: "USDC", decimals: 1 } },
      onRevoke: () => ({ onChainRevocationRequired: false as const }),
    };
    const { rerender } = render(
      <AuthorizationList {...props} trustedAssets={[]} />,
    );
    expect(
      screen.getByText("Unverified token — not on the trusted list"),
    ).toBeDefined();
    expect(screen.getByText("Spent 4 base units")).toBeDefined();
    expect(screen.queryByText(/USDC/)).toBeNull();

    rerender(<AuthorizationList {...props} />);
    expect(
      screen.queryByText("Unverified token — not on the trusted list"),
    ).toBeNull();
  });
  it("labels inactive expiry by status and keeps the ISO timestamp", () => {
    render(
      <AuthorizationList
        entries={[{ ...entry, status: "expired" } as ListedAuthorization]}
        locale="en-US"
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    const expiry = screen.getByText(/^Expired ·/);
    expect(expiry.getAttribute("title")).toBe("2033-05-18T03:33:20.000Z");
  });
  it("confirms before revoke and reports required on-chain work", async () => {
    const revoke = vi
      .fn()
      .mockResolvedValue({ onChainRevocationRequired: true });
    render(<AuthorizationList entries={[entry]} onRevoke={revoke} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector("[data-payment-actions]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(entry));
    expect(
      await screen.findByText(/Complete the on-chain revocation/),
    ).toBeDefined();
  });
  it("does not invent spent progress", () => {
    const { spent: _spent, ...withoutSpent } = entry;
    render(
      <AuthorizationList
        entries={[withoutSpent as ListedAuthorization]}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("shows a re-grant action without changing the grant", () => {
    const regrant = vi.fn();
    render(
      <AuthorizationList
        entries={[entry]}
        getRailGrantCheck={() => ({
          status: "needs-regrant",
          missingRail: "mpp-charge",
        })}
        onRegrant={regrant}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Re-grant needed");
    fireEvent.click(screen.getByRole("button", { name: "Re-grant" }));
    expect(regrant).toHaveBeenCalledWith(entry, "mpp-charge");
  });
});
