import type { Meta, StoryObj } from "@storybook/react"
import { AppkitTooltip, AppkitButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitTooltip> = {
  title: "WC/Tooltip",
  component: AppkitTooltip,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Top: Story = {
  args: { content: "This is a tooltip", placement: "top", children: <AppkitButton variant="outline">Hover me</AppkitButton> },
}
export const Bottom: Story = {
  args: { content: "Bottom tooltip", placement: "bottom", children: <AppkitButton variant="outline">Bottom</AppkitButton> },
}
