import type { Meta, StoryObj } from "@storybook/react"
import { AppkitTabs } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitTabs> = {
  title: "WC/Tabs",
  component: AppkitTabs,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    tabsJson: JSON.stringify([
      { id: "account", label: "Account" },
      { id: "security", label: "Security" },
      { id: "notifications", label: "Notifications" },
    ]),
    selected: "account",
  },
}
