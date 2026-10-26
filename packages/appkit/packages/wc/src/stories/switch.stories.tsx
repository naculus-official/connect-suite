import type { Meta, StoryObj } from "@storybook/react"
import { AppkitSwitch } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitSwitch> = {
  title: "WC/Switch",
  component: AppkitSwitch,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Off: Story = {
  render: () => <AppkitSwitch label="Dark mode" />,
}
export const On: Story = {
  render: () => <AppkitSwitch checked label="Dark mode" />,
}
export const Disabled: Story = {
  render: () => <AppkitSwitch label="Disabled" disabled />,
}
