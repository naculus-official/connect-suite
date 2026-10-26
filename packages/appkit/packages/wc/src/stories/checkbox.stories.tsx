import type { Meta, StoryObj } from "@storybook/react"
import { AppkitCheckbox } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitCheckbox> = {
  title: "WC/Checkbox",
  component: AppkitCheckbox,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Unchecked: Story = { args: { label: "Accept terms" } }
export const Checked: Story = { args: { checked: true, label: "Accept terms" } }
export const Disabled: Story = { args: { label: "Disabled", disabled: true } }
export const DisabledChecked: Story = { args: { checked: true, disabled: true, label: "Disabled" } }
