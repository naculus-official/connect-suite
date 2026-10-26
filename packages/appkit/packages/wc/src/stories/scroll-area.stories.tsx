import type { Meta, StoryObj } from "@storybook/react"
import { AppkitScrollArea } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitScrollArea> = {
  title: "WC/ScrollArea",
  component: AppkitScrollArea,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

const paragraphs = Array.from({ length: 6 }, (_, i) => (
  <p key={i} style={{ marginBottom: "0.75rem", lineHeight: 1.6 }}>
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
    tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
    veniam, quis nostrud exercitation ullamco laboris.
  </p>
))

export const Default: Story = {
  render: () => (
    <AppkitScrollArea style={{ height: "200px", width: "300px", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem" }}>
      {paragraphs}
    </AppkitScrollArea>
  ),
}
