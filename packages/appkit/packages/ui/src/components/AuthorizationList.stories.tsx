import type {
  Authorization,
  ListedAuthorization,
  RevokeListedAuthorizationResult,
} from "@naculus/connect-core";
import type { Meta, StoryObj } from "@storybook/react";
import { AuthorizationList } from "./AuthorizationList";

const base = {
  keyId: "example-coffee",
  status: "active",
  enforcer: "evm-session",
  principal: "owner",
  expiresAt: 2_000_000_000,
  grants: [
    {
      asset: "token",
      recipients: ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
      maxPerPayment: 25_000_000n,
      maxTotal: 250_000_000n,
      maxCount: 10,
      rails: ["x402-exact"],
    },
  ],
  spent: { token: 75_000_000n },
  flags: [],
  raw: {},
} as unknown as ListedAuthorization;
const meta = {
  title: "Payments/AuthorizationList",
  component: AuthorizationList,
  tags: ["autodocs"],
  args: {
    entries: [base],
    assets: { token: { symbol: "USDC", decimals: 6 } },
    onRevoke: async (): Promise<RevokeListedAuthorizationResult> => ({
      onChainRevocationRequired: false,
    }),
  },
} satisfies Meta<typeof AuthorizationList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
export const EveryStatus: Story = {
  args: {
    entries: (["active", "pending", "revoked", "expired"] as const).map(
      (status, index) => ({
        ...base,
        keyId: `${status}-${index}`,
        status,
        spent: index === 1 ? undefined : base.spent,
      }),
    ),
  },
};
export const WarningAndOnChainRevoke: Story = {
  args: {
    entries: [
      {
        ...base,
        flags: ["unrestricted-recipient-legacy", "not-expressible"],
        grants: [
          {
            ...base.grants[0],
            recipients: [
              "0x1111111111111111111111111111111111111111",
              "0x2222222222222222222222222222222222222222",
              "0x3333333333333333333333333333333333333333",
            ],
          },
        ],
      } as ListedAuthorization,
    ],
    onRevoke: async () => ({ onChainRevocationRequired: true }),
  },
};
export const Revoking: Story = { args: { revokingId: "example-coffee" } };
export const RegrantNeeded: Story = {
  args: {
    getRailGrantCheck: () => ({
      status: "needs-regrant",
      missingRail: "x402-exact",
    }),
    onRegrant: () => undefined,
  },
};
export const Empty: Story = { args: { entries: [] } };
export const MissingMetadataDark360: Story = {
  args: { ...WarningAndOnChainRevoke.args, assets: {} },
  decorators: [
    (Story) => (
      <div className="dark w-[360px] bg-background p-3 text-foreground">
        <Story />
      </div>
    ),
  ],
};

// Periodic entries start from a real Authorization and are listed the way an
// EVM session key manager lists them, so every line is describeAuthorization's.
const usdc = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const unlisted = "eip155:8453/erc20:0x4200000000000000000000000000000000000042";
const owner = "0x5e17aa2e2a4a3c4b23a49c0f1bbd58e4a5d8a4a7";
const periodStart = 1_999_827_200;
function periodic(
  asset: string,
  amount: bigint,
  seconds: number,
): Authorization {
  return {
    version: 1,
    principal: `eip155:8453:${owner}`,
    grants: [
      {
        asset,
        recipients: ["0x209693Bc6afc0C5328bA36FaF03C514EF312287C"],
        maxPerPayment: 25_000_000n,
        maxTotal: 250_000_000n,
        period: { amount, seconds, start: periodStart },
        rails: ["x402-exact"],
      },
    ],
    expiresAt: 2_000_000_000,
  };
}
function listed(
  keyId: string,
  authorization: Authorization,
  spent: bigint,
): ListedAuthorization {
  return {
    keyId,
    status: "active",
    enforcer: "evm-session",
    principal: authorization.principal,
    expiresAt: authorization.expiresAt,
    grants: authorization.grants,
    spent: { [authorization.grants[0].asset]: spent },
    flags: [],
    raw: {
      id: keyId,
      publicKey: "0x04aa",
      scope: {
        expiry: authorization.expiresAt,
        mode: "offchain",
        rails: ["transfer"],
      },
      status: "active",
      createdAt: periodStart * 1_000,
      expiresAt: authorization.expiresAt * 1_000,
      useCount: 0,
      signerAddress: owner,
    },
  };
}
const monthlyOnChain = listed(
  "monthly-on-chain",
  periodic(usdc, 25_000_000n, 2_592_000),
  50_000_000n,
);
const hourlyDevice = listed(
  "hourly-device",
  periodic(usdc, 5_000_000n, 3_600),
  10_000_000n,
);
const unverifiedPeriodic = listed(
  "unverified-periodic",
  periodic(unlisted, 25_000_000n, 2_592_000),
  50_000_000n,
);
const periodicArgs = {
  // Metadata for the unlisted token too: the trusted list, not missing
  // metadata, is what keeps its amounts in base units.
  assets: {
    [usdc]: { symbol: "USDC", decimals: 6 },
    [unlisted]: { symbol: "USDC", decimals: 6 },
  },
  trustedAssets: [usdc],
};
export const PeriodicOnChainMonthly: Story = {
  args: {
    ...periodicArgs,
    entries: [monthlyOnChain],
    getEnforcement: () => "on-chain",
  },
};
export const PeriodicDeviceHourly: Story = {
  args: {
    ...periodicArgs,
    entries: [hourlyDevice],
    getEnforcement: () => "device",
  },
};
export const PeriodicUnverifiedAsset: Story = {
  args: {
    ...periodicArgs,
    entries: [unverifiedPeriodic],
    getEnforcement: () => "on-chain",
  },
};
