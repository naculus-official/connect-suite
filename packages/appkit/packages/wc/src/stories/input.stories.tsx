import type { Meta, StoryObj } from "@storybook/react"
import { AppkitInput } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitInput> = {
  title: "WC/Input",
  component: AppkitInput,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { args: { placeholder: "Enter text..." } }
export const WithValue: Story = { args: { value: "Hello World" } }
export const Disabled: Story = { args: { placeholder: "Disabled", disabled: true } }
export const Invalid: Story = { args: { placeholder: "Invalid input", invalid: true } }
export const TypeNumber: Story = { args: { type: "number", placeholder: "0" } }
