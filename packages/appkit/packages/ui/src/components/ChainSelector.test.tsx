/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

// Minimal button component for tests (replaces the removed DefaultButton fallback)
function TestButton({ children, className, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({ Button: TestButton }),
}))

// Mock react hooks
const mockUseChain = vi.fn()
const mockUseWallet = vi.fn()
vi.mock("@naculus/connect-appkit-react", () => ({
  useChain: () => mockUseChain(),
  useWallet: () => mockUseWallet(),
}))

import { ChainSelector } from "./ChainSelector"

describe("ChainSelector", () => {
  const mockSwitchChain = vi.fn()

  const defaultChainState = {
    currentChain: null,
    availableChains: [],
    switchChain: mockSwitchChain,
    isEvm: false,
    isSolana: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseChain.mockReturnValue(defaultChainState)
    mockUseWallet.mockReturnValue({ isConnected: false })
  })

  afterEach(() => {
    cleanup()
  })

  it("renders nothing when disconnected", () => {
    mockUseWallet.mockReturnValue({ isConnected: false })
    mockUseChain.mockReturnValue({
      ...defaultChainState,
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
    })

    const { container } = render(<ChainSelector />)
    expect(container.innerHTML).toBe("")
  })

  it("shows read-only chain display when only one chain available", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      ...defaultChainState,
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [{ caip2: "eip155:1", name: "Ethereum" }],
      isEvm: true,
    })

    render(<ChainSelector />)
    expect(screen.getByText("Ethereum")).toBeDefined()
    // Should not open a dropdown
    expect(screen.queryByText("Switch Network")).toBeNull()
  })

  it("renders current chain name when connected with multiple chains", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain: mockSwitchChain,
      isEvm: true,
    })

    render(<ChainSelector />)
    expect(screen.getByText("Ethereum")).toBeDefined()
  })

  it("opens dropdown on click showing all chains", () => {
    const switchChain = vi.fn().mockResolvedValue(undefined)
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain,
      isEvm: true,
    })

    render(<ChainSelector />)
    // Click the trigger button to open dropdown
    fireEvent.click(screen.getByText("Ethereum"))
    // Dropdown should show both chains
    expect(screen.getByText("Switch Network")).toBeDefined()
    expect(screen.getByText("Polygon")).toBeDefined()
  })

  it("switches chain when clicking a different chain in dropdown", () => {
    const switchChain = vi.fn().mockResolvedValue(undefined)
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain,
      isEvm: true,
    })

    render(<ChainSelector />)
    // Open dropdown
    fireEvent.click(screen.getByText("Ethereum"))
    // Click Polygon to switch
    fireEvent.click(screen.getByText("Polygon"))

    expect(switchChain).toHaveBeenCalledWith("eip155:137")
  })

  it("renders active chain with checkmark in dropdown", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain: mockSwitchChain,
      isEvm: true,
    })

    render(<ChainSelector />)
    fireEvent.click(screen.getByText("Ethereum"))
    // Ethereum should be in the dropdown list
    const ethItems = screen.getAllByText("Ethereum")
    expect(ethItems.length).toBeGreaterThanOrEqual(2) // trigger button + dropdown item
  })

  it("shows Unknown Chain when currentChain is null but connected", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: null,
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain: mockSwitchChain,
    })

    render(<ChainSelector />)
    expect(screen.getByText("Unknown Chain")).toBeDefined()
  })

  it("does not switch chain when clicking already active chain in dropdown", () => {
    const switchChain = vi.fn()
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain,
      isEvm: true,
    })

    render(<ChainSelector />)
    fireEvent.click(screen.getByText("Ethereum"))
    // Get all Ethereum elements and click the dropdown one (not the trigger)
    const items = screen.getAllByText("Ethereum")
    // Click the dropdown item (second one)
    fireEvent.click(items[1])
    expect(switchChain).not.toHaveBeenCalled()
  })

  it("applies custom className to the container", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain: mockSwitchChain,
      isEvm: true,
    })

    render(<ChainSelector className="my-chain-class" />)
    const container = document.querySelector(".my-chain-class")
    expect(container).not.toBeNull()
  })

  it("renders minimal variant showing just chain name", () => {
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain: mockSwitchChain,
      isEvm: true,
    })

    render(<ChainSelector variant="minimal" />)
    expect(screen.getByText("Ethereum")).toBeDefined()
    // No dropdown container
    expect(screen.queryByText("Switch Network")).toBeNull()
  })

  it("renders buttons variant showing all chains", () => {
    const switchChain = vi.fn().mockResolvedValue(undefined)
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain,
      isEvm: true,
    })

    render(<ChainSelector variant="buttons" />)
    expect(screen.getByText("Ethereum")).toBeDefined()
    expect(screen.getByText("Polygon")).toBeDefined()
    expect(screen.getByText("ETH")).toBeDefined()
    expect(screen.getByText("MATIC")).toBeDefined()
  })

  it("switches chain in buttons variant", () => {
    const switchChain = vi.fn().mockResolvedValue(undefined)
    mockUseWallet.mockReturnValue({ isConnected: true })
    mockUseChain.mockReturnValue({
      currentChain: { caip2: "eip155:1", name: "Ethereum" },
      availableChains: [
        { caip2: "eip155:1", name: "Ethereum", token: "ETH" },
        { caip2: "eip155:137", name: "Polygon", token: "MATIC" },
      ],
      switchChain,
      isEvm: true,
    })

    render(<ChainSelector variant="buttons" />)
    fireEvent.click(screen.getByText("Polygon"))
    expect(switchChain).toHaveBeenCalledWith("eip155:137")
  })
})
