/// <reference types="vitest" />
/// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { PaymentRecord } from "@naculus/connect-appkit-core";
import { afterEach, describe, expect, it } from "vitest";
import { PaymentReceipt } from "./PaymentReceipt";

const record: PaymentRecord = {
  protocol: "x402",
  resource: "https://merchant.example/coffee",
  chainId: "eip155:8453",
  asset: "token",
  payTo: "0x1111111111111111111111111111111111111111",
  amount: "2500000",
  reference:
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  verification: { status: "unverified" },
};
afterEach(cleanup);

describe("PaymentReceipt", () => {
  it.each([
    "unverified",
    "pending",
    "verified",
    "mismatch",
    "failed",
    "unavailable",
  ] as const)("renders %s verification with text", (status) => {
    render(
      <PaymentReceipt
        record={{
          ...record,
          verification: {
            status,
            reason: status === "failed" ? "RPC refused" : undefined,
          },
        }}
      />,
    );
    expect(
      document.querySelector(`[data-verification="${status}"]`),
    ).not.toBeNull();
    expect(
      screen.getAllByText(/server|chain|verified|match|failed|unavailable/i)
        .length,
    ).toBeGreaterThan(0);
  });
  it("never gives unverified a success treatment or paid wording", () => {
    render(<PaymentReceipt record={record} />);
    const root = document.querySelector('[data-verification="unverified"]')!;
    expect(root.textContent?.toLowerCase()).not.toContain("paid");
    expect(root.querySelector(".bg-emerald-50")).toBeNull();
    expect(screen.getByText(/not yet checked/i)).toBeDefined();
  });
  it("formats known assets and labels copy and explorer controls", () => {
    render(
      <PaymentReceipt
        record={{ ...record, verification: { status: "verified" } }}
        assets={{ token: { symbol: "USDC", decimals: 6 } }}
        explorerUrl={() => "https://explorer.example/tx"}
      />,
    );
    expect(screen.getByText("2.5 USDC")).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: /Copy/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /View on explorer/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: /View on explorer/ }).className,
    ).toContain("naculus-hit-target");
  });
  it("groups large known and base-unit amounts and preserves protocol casing", () => {
    const { rerender } = render(
      <PaymentReceipt
        record={{ ...record, amount: "1234567890000" }}
        assets={{ token: { symbol: "USDC", decimals: 6 } }}
      />,
    );
    expect(screen.getByText("1,234,567.89 USDC")).toBeDefined();
    expect(screen.getByText("x402")).toBeDefined();
    rerender(
      <PaymentReceipt
        record={{ ...record, protocol: "mpp", amount: "1234567", asset: null }}
      />,
    );
    expect(screen.getByText("1,234,567 base units")).toBeDefined();
    expect(screen.getByText("MPP")).toBeDefined();
  });
  it("is honest when time and metadata are absent", () => {
    render(
      <PaymentReceipt
        record={{ ...record, asset: null, amount: null, reference: null }}
      />,
    );
    expect(screen.getByText("Not recorded")).toBeDefined();
    expect(screen.getByText("Amount not reported")).toBeDefined();
  });
});
