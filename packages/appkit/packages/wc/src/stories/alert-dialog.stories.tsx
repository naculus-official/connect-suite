import type { Meta, StoryObj } from "@storybook/react"
import { AppkitAlertDialog, AppkitButton } from "@naculus/connect-appkit-react"
import { useState } from "react"

const Demo = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <AppkitButton variant="destructive" onClick={() => setOpen(true)}>Delete Account</AppkitButton>
      <AppkitAlertDialog
        open={open}
        heading="Delete Account"
        description="This action cannot be undone. Your account and all associated data will be permanently deleted."
        onAppkitClose={() => setOpen(false)}
      >
        <div slot="footer" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <AppkitButton variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</AppkitButton>
          <AppkitButton variant="destructive" size="sm" onClick={() => setOpen(false)}>Delete</AppkitButton>
        </div>
      </AppkitAlertDialog>
    </>
  )
}

const meta: Meta<typeof AppkitAlertDialog> = {
  title: "WC/AlertDialog",
  component: AppkitAlertDialog,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: () => <Demo /> }
