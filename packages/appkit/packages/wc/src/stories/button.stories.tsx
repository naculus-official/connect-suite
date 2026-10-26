import type { Meta, StoryObj } from "@storybook/react"
import { AppkitButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitButton> = {
  title: "WC/AppkitButton",
  component: AppkitButton,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    disabled: { control: "boolean" },
    locale: { control: "select", options: ["en", "zh-TW"] },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: "Connect Wallet" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "Connect Wallet" },
}

export const Destructive: Story = {
  args: { variant: "destructive", children: "Disconnect" },
}

export const Ghost: Story = {
  args: { variant: "ghost", children: "Settings" },
}

export const Small: Story = {
  args: { size: "sm", children: "Small Button" },
}

export const Large: Story = {
  args: { size: "lg", children: "Large Button" },
}

export const IconSize: Story = {
  args: { size: "icon", children: "🔔" },
}

export const Disabled: Story = {
  args: { children: "Can't Click", disabled: true },
}

export const ChineseLocale: Story = {
  args: { locale: "zh-TW", children: "連接錢包" },
}
