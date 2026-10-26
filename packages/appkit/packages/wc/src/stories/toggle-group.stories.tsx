import type { Meta, StoryObj } from "@storybook/react"
import { AppkitToggleGroup } from "@naculus/connect-appkit-react"

const items = JSON.stringify([
  { id: "bold", label: "B" },
  { id: "italic", label: "I" },
  { id: "underline", label: "U" },
])

const meta: Meta<typeof AppkitToggleGroup> = {
  title: "WC/ToggleGroup",
  component: AppkitToggleGroup,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Single: Story = { args: { itemsJson: items } }
export const Multi: Story = { args: { itemsJson: items, multiple: true, selected: ["bold"] } }
