import { explainSpend } from "@naculus/connect-appkit-core";
import type { Authorization, ListedAuthorization } from "@naculus/connect-core";
import type { Meta, StoryObj } from "@storybook/react";
import { AuthorizationConsent } from "./AuthorizationConsent";

const asset = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const recipient = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const assets = { [asset]: { symbol: "USDC", decimals: 6 } };
const now = 1_999_827_200;
const authorization: Authorization = {
  version: 1,
  label: "Example Pay daily budget",
  principal: "eip155:8453:0xowner",
  grants: [
    {
      asset,
      recipients: [recipient],
      maxPerPayment: 25_000_000n,
      maxTotal: 250_000_000n,
      maxCount: 10,
      rails: ["x402-exact", "mpp-charge"],
    },
  ],
  expiresAt: 2_000_000_000,
};
const request = {
  asset,
  recipient,
  amount: 25_000_000n,
  rail: "x402-exact" as const,
  at: now,
  spentSoFar: 25_000_000n,
  countSoFar: 1,
};
const meta = {
  title: "Payments/AuthorizationConsent",
  component: AuthorizationConsent,
  tags: ["autodocs"],
  args: {
    authorization,
    assets,
    now,
    requester: { name: "Example Pay", origin: "https://pay.sender.example" },
    onApprove: () => undefined,
    onDecline: () => undefined,
  },
} satisfies Meta<typeof AuthorizationConsent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Allowed: Story = {
  args: { preview: explainSpend(authorization, request, { assets }) },
};
export const Blocked: Story = {
  args: {
    preview: explainSpend(authorization, {
      ...request,
      recipient: "0x1111111111111111111111111111111111111111",
    }),
  },
};
export const Busy: Story = { args: { busy: true } };
export const RegrantNeeded: Story = {
  args: {
    railGrantCheck: {
      status: "needs-regrant",
      missingRail: "x402-exact",
    },
    onRegrant: () => undefined,
  },
};
export const PeriodicOnChain: Story = {
  args: {
    authorization: {
      ...authorization,
      grants: [
        {
          ...authorization.grants[0],
          period: {
            amount: 25_000_000n,
            seconds: 2_592_000,
            start: now,
          },
        },
      ],
    },
    enforcement: "on-chain",
  },
};
// Each periodic story passes a real Authorization through the component, so
// the period line is what describeAuthorization renders, not a fixture string.
const hourlyDeviceAuthorization: Authorization = {
  ...authorization,
  label: "Example Pay hourly budget",
  grants: [
    {
      ...authorization.grants[0],
      period: { amount: 5_000_000n, seconds: 3_600, start: now },
    },
  ],
};
export const PeriodicDeviceHourly: Story = {
  args: { authorization: hourlyDeviceAuthorization, enforcement: "device" },
};
const unverifiedAsset =
  "eip155:8453/erc20:0x4200000000000000000000000000000000000042";
const unverifiedPeriodicAuthorization: Authorization = {
  ...authorization,
  label: "Unlisted token budget",
  grants: [
    {
      ...authorization.grants[0],
      asset: unverifiedAsset,
      period: { amount: 25_000_000n, seconds: 2_592_000, start: now },
    },
  ],
};
// The caller has metadata for the token, but it is not on the trusted list:
// every amount, the period included, stays in base units.
export const PeriodicUnverifiedAsset: Story = {
  args: {
    authorization: unverifiedPeriodicAuthorization,
    assets: {
      ...assets,
      [unverifiedAsset]: { symbol: "USDC", decimals: 6 },
    },
    trustedAssets: [asset],
    enforcement: "on-chain",
  },
};
const warningAuthorization = {
  ...authorization,
  keyId: "legacy-key",
  status: "active",
  enforcer: "evm-session",
  grants: [
    {
      ...authorization.grants[0],
      recipients: [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        "0x3333333333333333333333333333333333333333",
      ],
      maxPerPayment: 9_999_999_999_999_999_123_456n,
    },
  ],
  flags: ["unrestricted-recipient-legacy", "not-expressible"],
  raw: {},
} as unknown as ListedAuthorization;
export const WarningManyRecipients: Story = {
  args: { authorization: warningAuthorization },
};
export const MissingMetadata: Story = { args: { assets: {} } };
export const Dark360: Story = {
  args: WarningManyRecipients.args,
  decorators: [
    (Story) => (
      <div className="dark w-[360px] bg-background p-3 text-foreground">
        <Story />
      </div>
    ),
  ],
};
export const DarkPeriodic360: Story = {
  args: PeriodicOnChain.args,
  decorators: [
    (Story) => (
      <div className="dark w-[360px] bg-background p-3 text-foreground">
        <Story />
      </div>
    ),
  ],
};
