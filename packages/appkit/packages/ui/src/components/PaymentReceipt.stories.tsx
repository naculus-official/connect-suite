import type { Meta, StoryObj } from "@storybook/react";
import type {
  PaymentRecord,
  PaymentVerificationStatus,
} from "@naculus/connect-appkit-core";
import { PaymentReceipt } from "./PaymentReceipt";

const record: PaymentRecord = {
  protocol: "x402",
  resource: "https://merchant.example/coffee",
  chainId: "eip155:8453",
  asset: "token",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  amount: "4250000",
  reference:
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  verification: { status: "unverified" },
};
const meta = {
  title: "Payments/PaymentReceipt",
  component: PaymentReceipt,
  tags: ["autodocs"],
  args: {
    record,
    assets: { token: { symbol: "USDC", decimals: 6 } },
    explorerUrl: () =>
      "https://basescan.org/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
} satisfies Meta<typeof PaymentReceipt>;
export default meta;
type Story = StoryObj<typeof meta>;
function state(status: PaymentVerificationStatus, reason?: string): Story {
  return { args: { record: { ...record, verification: { status, reason } } } };
}
export const Unverified: Story = state("unverified");
export const Pending: Story = state("pending");
export const Verified: Story = state("verified");
export const Mismatch: Story = state(
  "mismatch",
  "Recipient differs from the signed payment",
);
export const Failed: Story = state("failed", "The RPC refused the receipt lookup");
export const Unavailable: Story = state("unavailable");
export const Mpp: Story = {
  args: {
    record: {
      ...record,
      protocol: "mpp",
      verification: { status: "verified" },
    },
  },
};
export const MissingMetadataLongValues: Story = {
  args: {
    assets: {},
    record: {
      ...record,
      amount: "999999999999999999123456",
      asset: "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      verification: { status: "unverified" },
    },
  },
};
export const Dark360: Story = {
  args: Mismatch.args,
  decorators: [
    (Story) => (
      <div className="dark w-[360px] bg-background p-3 text-foreground">
        <Story />
      </div>
    ),
  ],
};
