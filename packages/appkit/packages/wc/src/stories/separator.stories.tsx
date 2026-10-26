import type { Meta, StoryObj } from "@storybook/react"
import { AppkitSeparator } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitSeparator> = {
  title: "WC/Separator",
  component: AppkitSeparator,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  render: () => (
    <div style={{ width: "300px" }}>
      <p>Above</p>
      <AppkitSeparator />
      <p>Below</p>
    </div>
  ),
}

export const Vertical: Story = {
  render: () => (
    <div style={{ display: "flex", height: "60px", gap: "1rem", alignItems: "center" }}>
      <span>Left</span>
      <AppkitSeparator orientation="vertical" />
      <span>Right</span>
    </div>
  ),
}
