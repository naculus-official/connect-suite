import type { Meta, StoryObj } from "@storybook/react"
import { AppkitBadge } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitBadge> = {
  title: "WC/Badge",
  component: AppkitBadge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { children: "Badge" } }
export const Secondary: Story = { args: { variant: "secondary", children: "Secondary" } }
export const Destructive: Story = { args: { variant: "destructive", children: "Error" } }
export const Outline: Story = { args: { variant: "outline", children: "Outline" } }
