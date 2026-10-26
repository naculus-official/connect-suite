import type { Meta, StoryObj } from "@storybook/react"
import { AppkitCheckbox, AppkitSwitch } from "@naculus/connect-appkit-react"
import { useState } from "react"

const ToggleDemo = () => {
  const [checked, setChecked] = useState(false)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 200 }}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: story heading, not a form label */}
      <label style={{ fontWeight: 600 }}>Toggle Demo</label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <AppkitCheckbox checked={checked} onChange={(e: any) => setChecked(e.target?.checked ?? !checked)} />
        <span>Checkbox: {checked ? "ON" : "OFF"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <AppkitSwitch checked={checked} onChange={(e: any) => setChecked(e.target?.checked ?? !checked)} />
        <span>Switch: {checked ? "ON" : "OFF"}</span>
      </div>
    </div>
  )
}

const meta: Meta = {
  title: "WC/Toggle",
}
export default meta
type Story = StoryObj

export const Compare: Story = { render: () => <ToggleDemo /> }
