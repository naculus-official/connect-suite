/// <reference types="vitest" />
/// @vitest-environment jsdom

import type { Authorization } from "@naculus/connect-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizationConsent } from "./AuthorizationConsent";

const authorization: Authorization = {
  version: 1,
  principal: "eip155:8453:0xowner",
  label: "Coffee budget",
  grants: [
    {
      asset: "eip155:8453/erc20:0xtoken",
      recipients: ["0x1111111111111111111111111111111111111111"],
      maxPerPayment: 2_000_000n,
      maxTotal: 10_000_000n,
      maxCount: 5,
      rails: ["x402-exact", "mpp-charge"],
    },
  ],
  expiresAt: 2_000_000_000,
};

afterEach(cleanup);

describe("AuthorizationConsent", () => {
  it("renders limits, recipients, methods, expiry, and preview", () => {
    render(
      <AuthorizationConsent
        authorization={authorization}
        assets={{
          "eip155:8453/erc20:0xtoken": { symbol: "USDC", decimals: 6 },
        }}
        requester={{ name: "Example Pay", origin: "https://pay.example" }}
        preview={{
          allowed: false,
          reason: "over-total",
          sentence: "This amount exceeds the remaining total limit.",
        }}
        onApprove={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText("2 USDC")).toBeDefined();
    expect(screen.getByText("10 USDC")).toBeDefined();
    expect(screen.getByText("x402 exact")).toBeDefined();
    expect(screen.getByText(/Blocked/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Copy 0x111/ })).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Copy 0x111/ }).className,
    ).toContain("naculus-hit-target");
    expect(document.querySelector("[data-payment-actions]")).not.toBeNull();
    expect(screen.queryByText(/^Up to .* every /)).toBeNull();
    expect(screen.queryByText(/^Limits enforced by/)).toBeNull();
  });

  it("renders a periodic limit and on-chain enforcement from a real authorization", () => {
    render(
      <AuthorizationConsent
        authorization={{
          ...authorization,
          grants: [
            {
              ...authorization.grants[0],
              period: {
                amount: 3_000_000n,
                seconds: 2_592_000,
                start: 1_900_000_000,
              },
            },
          ],
        }}
        assets={{
          "eip155:8453/erc20:0xtoken": { symbol: "USDC", decimals: 6 },
        }}
        enforcement="on-chain"
        requester={{ name: "Example Pay" }}
        onApprove={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText("Up to 3 USDC every 30 days")).toBeDefined();
    expect(screen.getByText("Limits enforced by the blockchain")).toBeDefined();
  });

  it("calls actions, disables approve while busy, and maps Escape only to decline", () => {
    const approve = vi.fn();
    const decline = vi.fn();
    const { container } = render(
      <AuthorizationConsent
        authorization={authorization}
        requester={{ name: "Example Pay" }}
        busy
        onApprove={approve}
        onDecline={decline}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Approving…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.keyDown(container.firstElementChild as Element, {
      key: "Escape",
    });
    expect(decline).toHaveBeenCalledOnce();
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(decline).toHaveBeenCalledTimes(2);
  });

  it("renders non-dismissible warnings", () => {
    render(
      <AuthorizationConsent
        authorization={
          {
            ...authorization,
            grants: [
              {
                ...authorization.grants[0],
                maxPerPayment: 9_999_999_999_999_999_123_456n,
              },
            ],
            keyId: "legacy-key",
            status: "active",
            enforcer: "evm-session",
            flags: ["unrestricted-recipient-legacy"],
            raw: {},
          } as never
        }
        assets={{
          "eip155:8453/erc20:0xtoken": { symbol: "USDC", decimals: 6 },
        }}
        now={1_999_913_600}
        requester={{ name: "Legacy app" }}
        onApprove={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText("9,999,999,999,999,999.123456 USDC")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(
      "This key can pay any recipient.",
    );
    expect(screen.getByText("May 18, 2033, 03:33 UTC")).toBeDefined();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("warns only for unverified assets and hides hostile metadata", () => {
    const props = {
      authorization,
      assets: {
        "eip155:8453/erc20:0xtoken": { symbol: "USDC", decimals: 6 },
      },
      requester: { name: "Example Pay" },
      onApprove: () => {},
      onDecline: () => {},
    };
    const { rerender } = render(
      <AuthorizationConsent {...props} trustedAssets={[]} />,
    );
    expect(
      screen.getByText("Unverified token — not on the trusted list"),
    ).toBeDefined();
    expect(screen.getByText("0xtoken")).toBeDefined();
    expect(screen.getByText("2,000,000 base units")).toBeDefined();
    expect(screen.queryByText(/USDC/)).toBeNull();

    rerender(
      <AuthorizationConsent
        {...props}
        trustedAssets={["eip155:8453/erc20:0xTOKEN"]}
      />,
    );
    expect(
      screen.queryByText("Unverified token — not on the trusted list"),
    ).toBeNull();
    expect(screen.getByText("2 USDC")).toBeDefined();
  });

  it("shows a re-grant action for a missing payment rail", () => {
    const regrant = vi.fn();
    render(
      <AuthorizationConsent
        authorization={authorization}
        requester={{ name: "Example Pay" }}
        railGrantCheck={{
          status: "needs-regrant",
          missingRail: "x402-exact",
        }}
        onRegrant={regrant}
        onApprove={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Re-grant needed");
    expect(screen.getByRole("alert").textContent).toContain(
      "cannot sign x402-exact payments",
    );
    fireEvent.click(screen.getByRole("button", { name: "Re-grant" }));
    expect(regrant).toHaveBeenCalledWith("x402-exact");
  });
});
