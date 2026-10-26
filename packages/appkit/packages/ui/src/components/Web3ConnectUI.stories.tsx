import type { Meta, StoryObj } from "@storybook/react"
import { Web3ConnectUI } from "./Web3ConnectUI"

const meta: Meta<typeof Web3ConnectUI> = {
  title: "Web3ConnectUI",
  component: Web3ConnectUI,
  tags: ["autodocs"],
}

export default meta
type Story = StoryObj<typeof meta>

const mockConfig = {
  projectId: "mock-project-id",
  metadata: {
    name: "Test App",
    description: "Test app for storybook",
    url: "https://example.com",
    icons: ["https://example.com/icon.png"],
  },
}

export const EIP6963Only: Story = {
  args: {
    config: mockConfig,
    detectionMode: "eip6963",
    children: (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ marginBottom: "1rem", color: "var(--foreground)" }}>
          Web3ConnectUI — EIP-6963 mode
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
          WalletConnect relay skipped (wallet detection only)
        </p>
      </div>
    ),
  },
}

export const WalletConnectMode: Story = {
  args: {
    config: mockConfig,
    detectionMode: "walletconnect",
    children: (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p style={{ marginBottom: "1rem", color: "var(--foreground)" }}>
          Web3ConnectUI — WalletConnect mode
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
          WalletConnect relay enabled
        </p>
      </div>
    ),
  },
}
