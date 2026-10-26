import type { Meta, StoryObj } from "@storybook/react"
import { AppkitAccountButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitAccountButton> = {
  title: "WC/AccountButton",
  component: AppkitAccountButton,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const NotConnected: Story = {
  args: {},
}

export const WithAddress: Story = {
  args: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    showAddress: true,
  },
}

export const WithAddressAndBalance: Story = {
  args: {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    balance: "2.345",
    balanceSymbol: "ETH",
    showAddress: true,
    showBalance: true,
  },
}

export const BalanceLoading: Story = {
  args: {
    address: "0xabcdef1234567890abcdef1234567890abcdef12",
    balance: null,
    showAddress: true,
    showBalance: true,
  },
}
