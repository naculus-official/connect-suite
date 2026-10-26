import type { Meta, StoryObj } from "@storybook/react"
import { AppkitPopover, AppkitButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitPopover> = {
  title: "WC/Popover",
  component: AppkitPopover,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <AppkitPopover>
      <AppkitButton slot="trigger" variant="outline">Open</AppkitButton>
      <div style={{ padding: "1rem", minWidth: "200px" }}>
        <p style={{ margin: 0 }}>Popover content</p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "hsl(var(--muted-foreground))" }}>
          Click outside or press Escape to close.
        </p>
      </div>
    </AppkitPopover>
  ),
}
