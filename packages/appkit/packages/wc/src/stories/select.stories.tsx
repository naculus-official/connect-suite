import type { Meta, StoryObj } from "@storybook/react"
import { AppkitSelect } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitSelect> = {
  title: "WC/Select",
  component: AppkitSelect,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

const networks = [{ value: "eth", label: "Ethereum", icon: "⟠" }, { value: "polygon", label: "Polygon", icon: "⬡" }, { value: "arbitrum", label: "Arbitrum", icon: "🔷" }, { value: "optimism", label: "Optimism", icon: "🔴" }]
const noIcons = [{ value: "usd", label: "US Dollar" }, { value: "eur", label: "Euro" }, { value: "jpy", label: "Japanese Yen" }]

export const Default: Story = {
  render: () => <AppkitSelect optionsJson={JSON.stringify(networks)} placeholder="Select a network" />,
}
export const NoIcon: Story = {
  render: () => <AppkitSelect optionsJson={JSON.stringify(noIcons)} placeholder="Select currency" />,
}
export const Selected: Story = {
  render: () => <AppkitSelect optionsJson={JSON.stringify(networks)} value="eth" />,
}
