import type { Meta, StoryObj } from "@storybook/react"
import { AppkitAvatar } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitAvatar> = {
  title: "WC/Avatar",
  component: AppkitAvatar,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm", "lg"] },
  },
}
export default meta
type Story = StoryObj<typeof meta>

export const WithImage: Story = {
  args: {
    src: "https://i.pravatar.cc/80?u=alice",
    alt: "Alice",
    size: "default",
  },
}

export const FallbackInitials: Story = {
  args: { fallback: "JD", size: "default" },
}

export const Small: Story = {
  args: { fallback: "A", size: "sm" },
}

export const Large: Story = {
  args: { fallback: "B", size: "lg" },
}
