import type { Meta, StoryObj } from "@storybook/react"
import { AppkitConnectButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitConnectButton> = {
  title: "WC/ConnectButton",
  component: AppkitConnectButton,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Disconnected: Story = {
  args: {
    walletsJson: JSON.stringify([
      { id: "metamask", name: "MetaMask", rdns: "io.metamask" },
      { id: "rabby", name: "Rabby", rdns: "io.rabby" },
    ]),
  },
}

export const Connecting: Story = {
  args: {
    connecting: true,
    walletsJson: "[]",
  },
}

export const Connected: Story = {
  args: {
    connected: true,
    address: "eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    balance: "1.234",
    balanceSymbol: "ETH",
    walletsJson: "[]",
  },
}

export const ConnectedWithTokens: Story = {
  args: {
    connected: true,
    address: "0xabcdef1234567890abcdef1234567890abcdef12",
    balance: "0.5",
    balanceSymbol: "ETH",
    tokenBalancesJson: JSON.stringify([
      { symbol: "USDC", formatted: "1,000.00", name: "USD Coin" },
      { symbol: "DAI", formatted: "500.00", name: "Dai Stablecoin" },
    ]),
    explorerUrl: "https://etherscan.io",
    explorerLabel: "Etherscan",
    walletsJson: "[]",
  },
}
