/// <reference types="vitest" />
/// @vitest-environment jsdom

import {
  applySettlementVerification,
  describeAuthorization,
  describePayment,
  explainSpend,
  type PaymentRecord,
} from "@naculus/connect-appkit-core";
import type { Authorization, ListedAuthorization } from "@naculus/connect-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// React Native cannot run under jsdom: map its primitives to plain DOM
// elements, forwarding the accessibility props to their ARIA equivalents.
vi.mock("react-native", async () => {
  const React = await import("react");
  type Props = Record<string, any>;
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : style && typeof style === "object"
        ? (style as Record<string, unknown>)
        : {};
  const domProps = (props: Props) => {
    const state = props.accessibilityState ?? {};
    const value = props.accessibilityValue ?? {};
    const style =
      typeof props.style === "function"
        ? props.style({ pressed: false })
        : props.style;
    return {
      role: props.accessibilityRole,
      "aria-label": props.accessibilityLabel,
      "aria-disabled": state.disabled || undefined,
      "aria-busy": state.busy || undefined,
      "aria-selected": state.selected,
      "aria-live": props.accessibilityLiveRegion,
      "aria-valuemin": value.min,
      "aria-valuemax": value.max,
      "aria-valuenow": value.now,
      "data-testid": props.testID,
      "data-style": JSON.stringify(flatten(style)),
      "data-hit-slop": props.hitSlop,
    };
  };
  const host =
    (tag: string) =>
    ({ children, ...props }: Props) =>
      React.createElement(tag, domProps(props), children);
  const Pressable = ({ children, onPress, disabled, ...props }: Props) =>
    React.createElement(
      "button",
      { ...domProps(props), type: "button", disabled, onClick: onPress },
      typeof children === "function" ? children({ pressed: false }) : children,
    );
  const ScrollView = ({ children, ...props }: Props) =>
    React.createElement(
      "div",
      { ...domProps(props), "data-scroll": "" },
      children,
    );
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    ...props
  }: Props) =>
    React.createElement(
      "div",
      { ...domProps(props), "data-list": "" },
      ListHeaderComponent,
      data.length
        ? data.map((item: unknown, index: number) =>
            React.createElement(
              React.Fragment,
              { key: keyExtractor(item, index) },
              renderItem({ item, index }),
            ),
          )
        : ListEmptyComponent,
    );
  return {
    View: host("div"),
    Text: host("span"),
    Image: host("img"),
    Pressable,
    ScrollView,
    FlatList,
    StyleSheet: { create: <T,>(styles: T) => styles },
    useColorScheme: () => "light",
  };
});

const {
  AuthorizationConsentNative,
  AuthorizationListNative,
  PaymentReceiptNative,
  darkPaymentTheme,
  lightPaymentTheme,
  NativePaymentThemeProvider,
} = await import("./index");

afterEach(cleanup);

const USDC = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RECIPIENT = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const assets = { [USDC]: { symbol: "USDC", decimals: 6 } };

const authorization: Authorization = {
  version: 1,
  principal: "eip155:8453:0x2222222222222222222222222222222222222222",
  label: "Coffee budget",
  grants: [
    {
      asset: USDC,
      recipients: [RECIPIENT],
      maxPerPayment: 2_000_000n,
      maxTotal: 10_000_000n,
      maxCount: 5,
      rails: ["x402-exact", "mpp-charge"],
    },
  ],
  expiresAt: 2_000_000_000,
};

function listed(overrides: Partial<ListedAuthorization> = {}) {
  return {
    keyId: "key-1",
    status: "active",
    enforcer: "evm-session",
    principal: authorization.principal,
    expiresAt: authorization.expiresAt,
    grants: authorization.grants,
    spent: { [USDC]: 4_000_000n },
    flags: [],
    raw: {} as never,
    ...overrides,
  } as ListedAuthorization;
}

function style(element: Element): Record<string, unknown> {
  return JSON.parse(element.getAttribute("data-style") ?? "{}");
}

describe("AuthorizationConsentNative", () => {
  const consent = (
    props: Partial<Parameters<typeof AuthorizationConsentNative>[0]> = {},
  ) =>
    render(
      <AuthorizationConsentNative
        authorization={authorization}
        assets={assets}
        requester={{ name: "Example Pay", origin: "https://pay.example" }}
        onApprove={() => {}}
        onDecline={() => {}}
        {...props}
      />,
    );

  it("shows formatted limits, recipients, count, methods and expiry", () => {
    const onCopy = vi.fn();
    consent({ onCopy, now: 1_999_913_600 });
    expect(screen.getByRole("header").textContent).toBe(
      "Allow Example Pay to pay?",
    );
    expect(screen.getByText("2 USDC")).toBeDefined();
    expect(screen.getByText("10 USDC")).toBeDefined();
    expect(style(screen.getByText("2 USDC")).fontVariant).toEqual([
      "tabular-nums",
    ]);
    expect(screen.getByText("Up to 5")).toBeDefined();
    expect(screen.getByText("x402 exact")).toBeDefined();
    expect(screen.getByText("mpp charge")).toBeDefined();
    expect(screen.getByText("Expires in 1 day")).toBeDefined();
    expect(screen.getByText("May 18, 2033, 03:33 UTC")).toBeDefined();
    // The shortened form comes from the core view model, not from here.
    const [grant] = describeAuthorization(authorization, { assets }).grants;
    expect(screen.getByText(grant.recipients[0].shortened)).toBeDefined();
    const copy = screen.getByRole("button", { name: `Copy ${RECIPIENT}` });
    expect(copy.getAttribute("data-hit-slop")).toBe("6");
    fireEvent.click(copy);
    expect(onCopy).toHaveBeenCalledWith(RECIPIENT);
    expect(
      screen.getByRole("button", { name: `Copied ${RECIPIENT}` }),
    ).toBeDefined();
    expect(screen.queryByText(/^Up to .* every /)).toBeNull();
    expect(screen.queryByText(/^Limits enforced by/)).toBeNull();
  });

  it("shows a periodic limit and on-chain enforcement", () => {
    consent({
      authorization: {
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
      },
      enforcement: "on-chain",
    });
    expect(screen.getByText("Up to 3 USDC every 30 days")).toBeDefined();
    expect(screen.getByText("Limits enforced by the blockchain")).toBeDefined();
  });

  it("falls back to base units and the asset address without metadata", () => {
    consent({ assets: {} });
    expect(screen.getByText("2,000,000 base units")).toBeDefined();
    expect(screen.getByText("10,000,000 base units")).toBeDefined();
    expect(
      screen.getByText("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    ).toBeDefined();
    // No onCopy: no copy button is offered.
    expect(screen.queryByRole("button", { name: /^Copy / })).toBeNull();
  });

  it("defaults to English and honours the locale prop", () => {
    const { unmount } = consent({ now: 1_999_913_600 });
    expect(screen.getByText("Expires in 1 day")).toBeDefined();
    unmount();
    consent({ now: 1_999_913_600, locale: "de" });
    expect(screen.getByText("Expires in 1 Tag")).toBeDefined();
  });

  it("renders warnings as non-dismissible alerts", () => {
    consent({
      authorization: listed({ flags: ["unrestricted-recipient-legacy"] }),
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This key can pay any recipient.");
    expect(style(alert).borderColor).toBe(lightPaymentTheme.warningBorder);
    expect(screen.queryByRole("button", { name: /dismiss|close/i })).toBeNull();
  });

  it("warns only for unverified assets and hides hostile metadata", () => {
    const { rerender } = consent({ trustedAssets: [] });
    expect(
      screen.getByText("Unverified token — not on the trusted list"),
    ).toBeDefined();
    expect(
      screen.getByText("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    ).toBeDefined();
    expect(screen.getByText("2,000,000 base units")).toBeDefined();
    expect(screen.queryByText(/USDC/)).toBeNull();

    rerender(
      <AuthorizationConsentNative
        authorization={authorization}
        assets={assets}
        trustedAssets={[USDC.toLowerCase()]}
        requester={{ name: "Example Pay" }}
        onApprove={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(
      screen.queryByText("Unverified token — not on the trusted list"),
    ).toBeNull();
    expect(screen.getByText("2 USDC")).toBeDefined();
  });

  it("shows the Allowed / Blocked preview from explainSpend", () => {
    const request = {
      asset: USDC,
      recipient: RECIPIENT,
      rail: "x402-exact" as const,
      at: 1_900_000_000,
      spentSoFar: 0n,
      countSoFar: 0,
    };
    const allowed = explainSpend(
      authorization,
      { ...request, amount: 1_000_000n },
      { assets },
    );
    const { unmount } = consent({ preview: allowed });
    expect(screen.getByText(allowed.sentence, { exact: false })).toBeDefined();
    expect(screen.getByText("Allowed.")).toBeDefined();
    unmount();
    const blocked = explainSpend(authorization, {
      ...request,
      amount: 3_000_000n,
    });
    consent({ preview: blocked });
    expect(screen.getByText("Blocked.")).toBeDefined();
    expect(
      screen.getByText("This amount exceeds the per-payment limit.", {
        exact: false,
      }),
    ).toBeDefined();
  });

  it("keeps actions outside the scroll view and disables Approve while busy", () => {
    const approve = vi.fn();
    const decline = vi.fn();
    consent({ busy: true, onApprove: approve, onDecline: decline });
    const actions = screen.getByTestId("payment-actions");
    expect(actions.closest("[data-scroll]")).toBeNull();
    const approveButton = within(actions).getByRole("button", {
      name: "Approving…",
    });
    expect(approveButton.hasAttribute("disabled")).toBe(true);
    expect(approveButton.getAttribute("aria-busy")).toBe("true");
    expect(approveButton.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(approveButton);
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(within(actions).getByRole("button", { name: "Decline" }));
    expect(decline).toHaveBeenCalledOnce();
  });

  it("approves when not busy", () => {
    const approve = vi.fn();
    consent({ onApprove: approve });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(approve).toHaveBeenCalledOnce();
  });
});

describe("AuthorizationListNative", () => {
  it("shows an empty state", () => {
    render(
      <AuthorizationListNative
        entries={[]}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("No payment authorizations")).toBeDefined();
    expect(
      screen.getByText("Approvals you create will appear here."),
    ).toBeDefined();
  });

  it("shows spent against total in one unit with a progress bar", () => {
    render(
      <AuthorizationListNative
        entries={{ entries: [listed()] }}
        assets={assets}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("Spent 4 USDC")).toBeDefined();
    expect(screen.getByText("Total 10 USDC")).toBeDefined();
    expect(screen.getByText("EVM session key")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "40",
    );
    expect(screen.queryByText(/^Up to .* every /)).toBeNull();
    expect(screen.queryByText(/^Limits enforced by/)).toBeNull();
  });

  it("shows periodic limits with per-entry enforcement", () => {
    const periodic = listed({
      grants: [
        {
          ...authorization.grants[0],
          period: {
            amount: 3_000_000n,
            seconds: 604_800,
            start: 1_900_000_000,
          },
        },
      ],
    });
    render(
      <AuthorizationListNative
        entries={[
          periodic,
          listed({ keyId: "key-2", grants: periodic.grants }),
        ]}
        assets={assets}
        getEnforcement={(entry) =>
          entry.keyId === "key-1" ? "device" : "on-chain"
        }
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getAllByText("Up to 3 USDC every 1 week")).toHaveLength(2);
    expect(screen.getByText("Limits enforced by this device")).toBeDefined();
    expect(screen.getByText("Limits enforced by the blockchain")).toBeDefined();
  });

  it("warns only for unverified assets and formats their spend in base units", () => {
    const props = {
      entries: [listed()],
      assets,
      onRevoke: () => ({ onChainRevocationRequired: false as const }),
    };
    const { rerender } = render(
      <AuthorizationListNative {...props} trustedAssets={[]} />,
    );
    expect(
      screen.getByText("Unverified token — not on the trusted list"),
    ).toBeDefined();
    expect(screen.getByText("Spent 4,000,000 base units")).toBeDefined();
    expect(screen.queryByText(/USDC/)).toBeNull();

    rerender(
      <AuthorizationListNative
        {...props}
        trustedAssets={[USDC.toLowerCase()]}
      />,
    );
    expect(
      screen.queryByText("Unverified token — not on the trusted list"),
    ).toBeNull();
    expect(screen.getByText("Spent 4 USDC")).toBeDefined();
  });

  it("never invents spend when the entry has none", () => {
    render(
      <AuthorizationListNative
        entries={[listed({ spent: undefined })]}
        assets={assets}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/^Spent/)).toBeNull();
  });

  it("gives every status its own text and colors", () => {
    const statuses = ["active", "pending", "revoked", "expired"] as const;
    render(
      <AuthorizationListNative
        entries={statuses.map((status) => listed({ keyId: status, status }))}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    const badges = statuses.map((status) =>
      screen.getByLabelText(`Status: ${status}`),
    );
    badges.forEach((badge, index) =>
      expect(badge.textContent).toContain(statuses[index]),
    );
    const fills = new Set(badges.map((badge) => style(badge).backgroundColor));
    expect(fills.size).toBe(statuses.length);
    // Only active and pending entries can be revoked.
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
  });

  it("asks for confirmation before revoking and shows the on-chain notice", async () => {
    const onRevoke = vi.fn(() => ({
      onChainRevocationRequired: true as const,
    }));
    const entry = listed();
    render(<AuthorizationListNative entries={[entry]} onRevoke={onRevoke} />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Confirm revoke" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    });
    expect(onRevoke).toHaveBeenCalledWith(entry);
    expect(screen.getByText(/Complete the on-chain revocation/)).toBeDefined();
  });

  it("disables the confirm button while revoking", () => {
    const { rerender } = render(
      <AuthorizationListNative
        entries={[listed()]}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    rerender(
      <AuthorizationListNative
        entries={[listed()]}
        revokingId="key-1"
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    const busy = screen.getByRole("button", { name: "Revoking…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
  });

  it("labels inactive entries by status with an English default date", () => {
    render(
      <AuthorizationListNative
        entries={[listed({ status: "expired" })]}
        onRevoke={() => ({ onChainRevocationRequired: false })}
      />,
    );
    expect(screen.getByText("Expired · May 18, 2033, 03:33 UTC")).toBeDefined();
  });
});

describe("PaymentReceiptNative", () => {
  const paid = describePayment("https://merchant.example/coffee", {
    response: new Response(null),
    paid: {
      scheme: "exact",
      network: "eip155:8453",
      asset: USDC,
      payTo: RECIPIENT,
      amount: "2500000",
    },
    settlement: {
      success: true,
      network: "eip155:8453",
      transaction: `0x${"a".repeat(64)}`,
    },
  }) as PaymentRecord;
  const withStatus = (
    status: PaymentRecord["verification"]["status"],
  ): PaymentRecord =>
    status === "unverified"
      ? paid
      : applySettlementVerification(
          paid,
          (status === "failed" || status === "mismatch"
            ? { status, reason: "RPC refused" }
            : { status }) as never,
        );
  const statuses = [
    "unverified",
    "pending",
    "verified",
    "mismatch",
    "failed",
    "unavailable",
  ] as const;

  it.each(statuses)("renders %s in a fixed-height live panel", (status) => {
    render(
      <PaymentReceiptNative record={withStatus(status)} assets={assets} />,
    );
    expect(screen.getByTestId(`verification-${status}`)).toBeDefined();
    const panel = screen.getByTestId("verification-panel");
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(style(panel).height).toBe(128);
    expect(panel.getAttribute("aria-label")).toBeTruthy();
    const success =
      style(panel).backgroundColor === lightPaymentTheme.successBackground;
    expect(success).toBe(status === "verified");
  });

  it("reads unverified as server-reported and never as success", () => {
    for (const theme of [lightPaymentTheme, darkPaymentTheme]) {
      const { unmount } = render(
        <PaymentReceiptNative record={paid} theme={theme} />,
      );
      expect(paid.verification.status).toBe("unverified");
      expect(
        screen.getByText("Reported by the server, not yet checked."),
      ).toBeDefined();
      const panel = style(screen.getByTestId("verification-panel"));
      const successColors = [
        theme.successBackground,
        theme.successBorder,
        theme.successForeground,
      ];
      expect(successColors).not.toContain(panel.backgroundColor);
      expect(successColors).not.toContain(panel.borderColor);
      expect(
        screen.getByTestId("verification-unverified").textContent,
      ).not.toMatch(/paid|verified on chain/i);
      unmount();
    }
  });

  it("shows amount, recipient, protocol and reference with copy and explorer", () => {
    const onCopy = vi.fn();
    const onOpenExplorer = vi.fn();
    const record = withStatus("verified");
    render(
      <PaymentReceiptNative
        record={record}
        assets={assets}
        onCopy={onCopy}
        onOpenExplorer={onOpenExplorer}
      />,
    );
    expect(screen.getByRole("header").textContent).toBe("2.5 USDC");
    expect(screen.getByText("x402")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: `Copy ${record.reference}` }),
    );
    expect(onCopy).toHaveBeenCalledWith(record.reference);
    fireEvent.click(screen.getByRole("link", { name: "View on explorer" }));
    expect(onOpenExplorer).toHaveBeenCalledWith(record);
  });

  it("labels MPP and reports missing fields", () => {
    render(
      <PaymentReceiptNative
        record={{
          ...paid,
          protocol: "mpp",
          amount: null,
          payTo: null,
          reference: null,
        }}
      />,
    );
    expect(screen.getByText("MPP")).toBeDefined();
    expect(screen.getByText("Amount not reported")).toBeDefined();
    expect(screen.getAllByText("Not reported")).toHaveLength(2);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("takes the theme from the provider", () => {
    render(
      <NativePaymentThemeProvider theme={darkPaymentTheme}>
        <PaymentReceiptNative record={withStatus("verified")} />
      </NativePaymentThemeProvider>,
    );
    expect(
      style(screen.getByTestId("verification-panel")).backgroundColor,
    ).toBe(darkPaymentTheme.successBackground);
  });
});

describe("NativePaymentTheme", () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([lightPaymentTheme, darkPaymentTheme])(
    "keeps every text pair at 4.5:1 or more ($scheme)",
    (theme) => {
      const pairs: [string, string][] = [
        [theme.foreground, theme.background],
        [theme.foreground, theme.card],
        [theme.foreground, theme.muted],
        [theme.mutedForeground, theme.background],
        [theme.mutedForeground, theme.muted],
        [theme.primaryForeground, theme.primary],
        [theme.successForeground, theme.successBackground],
        [theme.dangerForeground, theme.dangerBackground],
        [theme.dangerForeground, theme.card],
        [theme.warningForeground, theme.warningBackground],
      ];
      for (const [text, background] of pairs) {
        expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
