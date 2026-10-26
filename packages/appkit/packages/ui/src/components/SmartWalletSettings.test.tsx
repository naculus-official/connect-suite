/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import { SmartWalletSettings } from "./SmartWalletSettings"

// Minimal test components
function TestButton({ children, className, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

function TestCard({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...rest}>{children}</div>
}

function TestInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />
}

function TestLabel({ children, className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: test stand-in for a registry Label; the control is passed via htmlFor
  return <label className={className} {...rest}>{children}</label>
}

function TestSeparator({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <hr className={className} {...rest} />
}

vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({
    Button: TestButton,
    Card: TestCard,
    Input: TestInput,
    Label: TestLabel,
    Separator: TestSeparator,
  }),
}))

describe("SmartWalletSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders all config sections", () => {
    render(<SmartWalletSettings />)
    // Sections
    expect(screen.getByText("Smart Wallet Settings")).toBeDefined()
    expect(screen.getByText("Verification Method")).toBeDefined()
    expect(screen.getByText("Gas Fees")).toBeDefined()
    expect(screen.getByText("Bundler")).toBeDefined()
  })

  it("renders all account type options", () => {
    render(<SmartWalletSettings />)
    expect(screen.getByText("Single Sign (default)")).toBeDefined()
    expect(screen.getByText("Multi-Sign (2-of-3)")).toBeDefined()
    expect(screen.getByText("Social Recovery")).toBeDefined()
  })

  it("renders all paymaster options", () => {
    render(<SmartWalletSettings />)
    expect(screen.getByText("Pay Self (ETH)")).toBeDefined()
    expect(screen.getByText("Sponsored by dApp")).toBeDefined()
    expect(screen.getByText("Pay with USDC/USDT")).toBeDefined()
    expect(screen.getByText("Custom Paymaster URL")).toBeDefined()
  })

  it("renders all bundler options", () => {
    render(<SmartWalletSettings />)
    expect(screen.getByText("Pimlico")).toBeDefined()
    expect(screen.getByText("Stackup")).toBeDefined()
    expect(screen.getByText("Alchemy")).toBeDefined()
    expect(screen.getByText("Custom Bundler URL")).toBeDefined()
  })

  it("shows social recovery section when selected", () => {
    render(<SmartWalletSettings
      currentConfig={{ accountType: "social-recovery" } as any}
    />)
    expect(screen.getByText("Guardian Addresses")).toBeDefined()
    expect(screen.getByPlaceholderText("Enter guardian address (0x...)")).toBeDefined()
  })

  it("shows multi-sig threshold when selected", () => {
    render(<SmartWalletSettings
      currentConfig={{ accountType: "multi-sig" } as any}
    />)
    expect(screen.getByText("Signing Threshold")).toBeDefined()
    expect(screen.getByText("1-of-3")).toBeDefined()
    expect(screen.getByText("2-of-3")).toBeDefined()
    expect(screen.getByText("3-of-3")).toBeDefined()
  })

  it("shows custom paymaster input when custom selected", () => {
    render(<SmartWalletSettings
      currentConfig={{ paymasterType: "custom" } as any}
    />)
    expect(screen.getByPlaceholderText("Custom Paymaster URL")).toBeDefined()
  })

  it("shows custom bundler input when custom selected", () => {
    render(<SmartWalletSettings
      currentConfig={{ bundlerPreset: "custom" } as any}
    />)
    expect(screen.getByPlaceholderText("Custom Bundler URL")).toBeDefined()
  })

  it("calls onSave with config when save button clicked", () => {
    const onSave = vi.fn()
    render(<SmartWalletSettings onSave={onSave} />)
    fireEvent.click(screen.getByText("Save Settings"))
    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      accountType: "simple",
      paymasterType: "self",
      bundlerPreset: "pimlico",
    }))
  })

  it("calls onBack when back button clicked", () => {
    const onBack = vi.fn()
    render(<SmartWalletSettings onBack={onBack} />)
    const backBtn = screen.getByText("← Back to Simple Mode")
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it("shows saved state after save", async () => {
    render(<SmartWalletSettings onSave={vi.fn()} />)
    fireEvent.click(screen.getByText("Save Settings"))
    expect(screen.getByText("Saved ✓")).toBeDefined()
  })

  it("shows guardian addresses when provided", () => {
    render(<SmartWalletSettings
      currentConfig={{
        accountType: "social-recovery",
        guardians: ["0x1234567890abcdef1234567890abcdef12345678"],
      } as any}
    />)
    // Address is shown truncated
    expect(screen.getByText("0x123456...345678")).toBeDefined()
  })
})
