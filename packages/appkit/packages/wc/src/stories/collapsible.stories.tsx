import type { Meta, StoryObj } from "@storybook/react"
import { AppkitCollapsible, AppkitButton } from "@naculus/connect-appkit-react"

const meta: Meta<typeof AppkitCollapsible> = {
  title: "WC/Collapsible",
  component: AppkitCollapsible,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <AppkitCollapsible>
      <AppkitButton slot="trigger" variant="ghost" size="sm">Toggle details</AppkitButton>
      <p style={{ margin: 0 }}>Hidden content that reveals when expanded.</p>
    </AppkitCollapsible>
  ),
}
