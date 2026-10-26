import type { Meta, StoryObj } from "@storybook/react";
import {
  AppkitCard,
  AppkitCardHeader,
  AppkitCardTitle,
  AppkitCardDescription,
  AppkitCardContent,
  AppkitCardFooter,
  AppkitButton,
} from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitCard> = {
  title: "WC/Card",
  component: AppkitCard,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <AppkitCard style={{ maxWidth: "400px" }}>
      <AppkitCardHeader>
        <AppkitCardTitle>Card Title</AppkitCardTitle>
        <AppkitCardDescription>A short description of the card content.</AppkitCardDescription>
      </AppkitCardHeader>
      <AppkitCardContent>
        <p>Main content goes here. You can put anything inside the card.</p>
      </AppkitCardContent>
      <AppkitCardFooter>
        <AppkitButton variant="outline" size="sm">Cancel</AppkitButton>
        <AppkitButton size="sm">Confirm</AppkitButton>
      </AppkitCardFooter>
    </AppkitCard>
  ),
}
