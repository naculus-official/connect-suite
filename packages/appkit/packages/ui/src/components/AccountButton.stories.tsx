import type { Meta, StoryObj } from "@storybook/react";
import { AccountButton } from "./AccountButton";

const meta: Meta<typeof AccountButton> = {
  title: "AccountButton",
  component: AccountButton,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAddress: Story = {
  args: { address: "0x1234567890abcdef1234567890abcdef12345678" },
};

export const WithBalance: Story = {
  args: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    balance: "1.234",
    balanceSymbol: "ETH",
    showBalance: true,
  },
};

export const BalanceLoading: Story = {
  args: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    balance: null,
    balanceSymbol: "ETH",
    showBalance: true,
  },
};

export const WithoutAddress: Story = {
  args: { showBalance: false },
};
