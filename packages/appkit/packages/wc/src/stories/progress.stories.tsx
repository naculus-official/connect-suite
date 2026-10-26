import type { Meta, StoryObj } from "@storybook/react"
import { AppkitProgress } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitProgress> = {
  title: "WC/Progress",
  component: AppkitProgress,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Zero: Story = { args: { value: 0 } }
export const Half: Story = { args: { value: 50 } }
export const Complete: Story = { args: { value: 100 } }
export const WithLabel: Story = { args: { value: 75, label: "Loading..." } }
