import type { Meta, StoryObj } from "@storybook/react"
import { AppkitDialog, AppkitButton } from "@naculus/connect-appkit-react"
import { useState } from "react"

const DialogDemo = ({ title, showActions = false }: { title: string; showActions?: boolean }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <AppkitButton onClick={() => setOpen(true)}>Open Dialog</AppkitButton>
      <AppkitDialog open={open} heading={title} onAppkitClose={() => setOpen(false)}>
        <p>This is the dialog content. Press Escape or click outside to close.</p>
        {showActions && (
          <div slot="actions" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <AppkitButton variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</AppkitButton>
            <AppkitButton size="sm" onClick={() => setOpen(false)}>Confirm</AppkitButton>
          </div>
        )}
      </AppkitDialog>
    </>
  )
}

const meta: Meta<typeof AppkitDialog> = {
  title: "WC/Dialog",
  component: AppkitDialog,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <DialogDemo title="Confirm Action" showActions />,
}
