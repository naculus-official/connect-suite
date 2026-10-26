/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

import { SmartWalletToggle } from "./SmartWalletToggle"

// Minimal test components
function TestButton({ children, className, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

function TestCard({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...rest}>{children}</div>
}

function TestBadge({ children, variant, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { variant?: string }) {
  return <span className={className} {...rest}>{children}</span>
}

function TestSkeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...rest} />
}

vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({
    Button: TestButton,
    Card: TestCard,
    Badge: TestBadge,
    Skeleton: TestSkeleton,
  }),
}))

describe("SmartWalletToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders upgrade button when not deployed", () => {
    render(<SmartWalletToggle onUpgrade={vi.fn()} />)
    expect(screen.getByText("Smart Wallet")).toBeDefined()
    expect(screen.getByText("Not Upgraded")).toBeDefined()
    expect(screen.getByText("Upgrade Now")).toBeDefined()
  })

  it("renders estimated gas when provided", () => {
    const gas = BigInt("2000000000000000") // 0.002 ETH
    render(<SmartWalletToggle estimatedGas={gas} onUpgrade={vi.fn()} />)
    expect(screen.getByText(/gas fee/)).toBeDefined()
    expect(screen.getByText(/0\.002 ETH/)).toBeDefined()
  })

  it("shows deploying state with spinner", () => {
    render(<SmartWalletToggle isDeploying />)
    expect(screen.getByText("Deploying Smart Wallet...")).toBeDefined()
  })

  it("shows deployed state", () => {
    render(<SmartWalletToggle isDeployed />)
    expect(screen.getByText("Deployed")).toBeDefined()
    expect(screen.getByText("Your wallet has been upgraded to a smart wallet")).toBeDefined()
  })

  it("shows error message with retry button", () => {
    const onRetry = vi.fn()
    render(<SmartWalletToggle error="Transaction reverted" onRetry={onRetry} />)
    expect(screen.getByText("Deployment Failed")).toBeDefined()
    expect(screen.getByText("Transaction reverted")).toBeDefined()
    const retryBtn = screen.getByText("Retry")
    expect(retryBtn).toBeDefined()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("calls onUpgrade when upgrade button clicked", () => {
    const onUpgrade = vi.fn()
    render(<SmartWalletToggle onUpgrade={onUpgrade} />)
    fireEvent.click(screen.getByText("Upgrade Now"))
    expect(onUpgrade).toHaveBeenCalledOnce()
  })

  it("calls onShowSettings when settings button clicked", () => {
    const onShowSettings = vi.fn()
    render(<SmartWalletToggle onShowSettings={onShowSettings} />)
    fireEvent.click(screen.getByText("Advanced Settings"))
    expect(onShowSettings).toHaveBeenCalledOnce()
  })

  it("shows settings button in deployed state", () => {
    const onShowSettings = vi.fn()
    render(<SmartWalletToggle isDeployed onShowSettings={onShowSettings} />)
    expect(screen.getByText("Advanced Settings")).toBeDefined()
  })

  it("shows benefits when not deployed", () => {
    render(<SmartWalletToggle onUpgrade={vi.fn()} />)
    expect(screen.getByText(/No ETH needed/)).toBeDefined()
    expect(screen.getByText(/dApp sponsorship/)).toBeDefined()
    expect(screen.getByText(/recovery mechanism/)).toBeDefined()
  })
})
