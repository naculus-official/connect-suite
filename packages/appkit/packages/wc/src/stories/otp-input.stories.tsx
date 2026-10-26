import type { Meta, StoryObj } from "@storybook/react"
import { AppkitInput } from "@naculus/connect-appkit-react"
import { useState, useRef, useCallback } from "react"

const OtpDemo = ({ length = 4 }: { length?: number }) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(""))
  const refs = useRef<(HTMLElement | null)[]>([])

  const focusInput = useCallback((el: HTMLElement | null) => {
    const input = el?.shadowRoot?.querySelector("input") as HTMLInputElement | null
    input?.focus()
  }, [])

  const handleChange = (idx: number, val: string) => {
    if (val.length > 1) return
    if (val && !/^[0-9]$/.test(val)) return
    const next = [...values]
    next[idx] = val.slice(-1)
    setValues(next)
    if (val && idx < length - 1) {
      // advance to next
      requestAnimationFrame(() => focusInput(refs.current[idx + 1]))
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      e.preventDefault()
      if (idx === 0) {
        if (!values[0]) {
          // first field empty → clear all
          setValues(Array(length).fill(""))
        } else {
          // clear current only
          const next = [...values]
          next[0] = ""
          setValues(next)
        }
        focusInput(refs.current[0])
        return
      }
      // clear current + move back
      const next = [...values]
      next[idx] = ""
      setValues(next)
      requestAnimationFrame(() => focusInput(refs.current[idx - 1]))
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault()
      requestAnimationFrame(() => focusInput(refs.current[idx - 1]))
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault()
      requestAnimationFrame(() => focusInput(refs.current[idx + 1]))
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
      {values.map((v, i) => (
        <AppkitInput
          key={i}
          ref={(el: any) => (refs.current[i] = el)}
          value={v}
          onAppkitChange={(e: CustomEvent<string>) => handleChange(i, e.detail)}
          onKeyDown={handleKeyDown.bind(null, i)}
          maxLength={1}
          data-centered
          style={{ width: "3rem", fontSize: "1.5rem" }}
        />
      ))}
    </div>
  )
}

const meta: Meta<typeof AppkitInput> = {
  title: "WC/OtpInput",
  component: AppkitInput,
  tags: ["autodocs"],
}
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: () => <OtpDemo /> }
export const SixDigits: Story = { render: () => <OtpDemo length={6} /> }
