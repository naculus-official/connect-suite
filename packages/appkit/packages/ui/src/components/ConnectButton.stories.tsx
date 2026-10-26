import type { Meta, StoryObj } from "@storybook/react";
import { ConnectButton } from "./ConnectButton";

const meta: Meta<typeof ConnectButton> = {
  title: "ConnectButton",
  component: ConnectButton,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {};

export const Connecting: Story = {
  args: { isConnecting: true },
};

export const Connected: Story = {
  args: {
    isConnected: true,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    balance: "1.234",
    balanceSymbol: "ETH",
  },
};

export const WithLongBalance: Story = {
  args: {
    isConnected: true,
    address: "0xabcdef1234567890abcdef1234567890abcdef12",
    balance: "12345.678901234",
    balanceSymbol: "USDC",
  },
};

export const BalanceLoading: Story = {
  args: {
    isConnected: true,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    balance: null,
    balanceSymbol: "ETH",
    isBalanceLoading: true,
  },
};
