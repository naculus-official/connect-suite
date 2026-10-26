import type { Meta, StoryObj } from "@storybook/react"
import { AppkitAccordion } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitAccordion> = {
  title: "WC/Accordion",
  component: AppkitAccordion,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {
  args: { label: "What is this?", children: "This is the accordion content that reveals when opened." },
}
export const Opened: Story = {
  args: { label: "Details", open: true, children: "This content is visible by default." },
}
