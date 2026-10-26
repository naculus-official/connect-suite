import type { Meta, StoryObj } from "@storybook/react"
import { AppkitSkeleton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitSkeleton> = {
  title: "WC/Skeleton",
  component: AppkitSkeleton,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Text: Story = {
  render: () => (
    <AppkitSkeleton style={{ height: "1rem", width: "200px" }} />
  ),
}

export const Circle: Story = {
  render: () => (
    <AppkitSkeleton style={{ height: "3rem", width: "3rem", borderRadius: "9999px" }} />
  ),
}

export const CardSkeleton: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "300px" }}>
      <AppkitSkeleton style={{ height: "1.25rem", width: "60%" }} />
      <AppkitSkeleton style={{ height: "0.875rem", width: "100%" }} />
      <AppkitSkeleton style={{ height: "0.875rem", width: "80%" }} />
    </div>
  ),
}
