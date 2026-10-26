import type { Meta, StoryObj } from "@storybook/react"
import { AppkitDropdownMenu, AppkitButton } from "@naculus/connect-appkit-react"

const items = JSON.stringify([
  { id: "profile", label: "Profile" },
  { id: "settings", label: "Settings" },
  { id: "sep", separator: true },
  { id: "logout", label: "Logout", destructive: true },
])

const meta: Meta<typeof AppkitDropdownMenu> = {
  title: "WC/DropdownMenu",
  component: AppkitDropdownMenu,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { itemsJson: items },
  render: (args) => (
    <AppkitDropdownMenu itemsJson={args.itemsJson}>
      <AppkitButton slot="trigger" variant="outline">Menu</AppkitButton>
    </AppkitDropdownMenu>
  ),
}
