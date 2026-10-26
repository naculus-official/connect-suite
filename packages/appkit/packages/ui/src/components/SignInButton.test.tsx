/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"

afterEach(() => cleanup())

// Minimal button component for tests (replaces the removed DefaultButton fallback)
function TestButton({ children, className, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

// Mock useIsMobile
const mockUseIsMobile = vi.fn().mockReturnValue(false)
vi.mock("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

// Mock ComponentRegistry
const mockUseComponentRegistry = vi.fn()
vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => mockUseComponentRegistry(),
}))

// Mock @naculus/connect-appkit-react
vi.mock("@naculus/connect-appkit-react", () => ({
  Web3Context: { Provider: ({ children }: any) => children },
}))

import { SignInButton } from "./SignInButton"
import type { SiwxResult } from "@naculus/siwx"

function createMockResult(): SiwxResult {
  return {
    message: {
      raw: "example.com wants you to sign in with your Ethereum account:\n0x1234...\n\nSign in to access the app\n\nURI: https://example.com\nVersion: 1\nChain ID: eip155:1\nNonce: abc123\nIssued At: 2026-05-21T00:00:00.000Z",
      domain: "example.com",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      statement: "Sign in to access the app",
      uri: "https://example.com",
      version: 1,
      chainId: "eip155:1",
      nonce: "abc123",
      issuedAt: "2026-05-21T00:00:00.000Z",
      expirationTime: null,
      notBefore: null,
      resources: [],
      requestId: null,
      blockchain: "Ethereum",
    },
    signature: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b",
  }
}

describe("SignInButton", () => {
  beforeEach(() => {
    mockUseComponentRegistry.mockReturnValue({ Button: TestButton })
  })

  // ===== Idle state =====
  it("renders Sign In button in idle state", () => {
    render(<SignInButton />)
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy()
  })

  it("renders custom children in idle state", () => {
    render(<SignInButton>Custom Sign In</SignInButton>)
    expect(screen.getByText("Custom Sign In")).toBeTruthy()
  })

  it("calls onSignIn when clicked in idle state", () => {
    const onSignIn = vi.fn()
    render(<SignInButton onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  // ===== Signing-in state =====
  it("renders loading state when isSigningIn is true", () => {
    render(<SignInButton isSigningIn={true} />)
    expect(screen.getByText("Signing In...")).toBeTruthy()
  })

  it("button is disabled when signing in", () => {
    render(<SignInButton isSigningIn={true} />)
    const btn = screen.getByRole("button", { name: /signing in/i })
    // Use direct attribute check instead of toBeDisabled (jest-dom not available)
    expect(btn.hasAttribute("disabled")).toBe(true)
  })

  it("does not call onSignIn when signing in", () => {
    const onSignIn = vi.fn()
    render(<SignInButton isSigningIn={true} onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole("button", { name: /signing in/i }))
    expect(onSignIn).not.toHaveBeenCalled()
  })

  // ===== Error state =====
  it("renders error state with retry button", () => {
    const error = new Error("Sign-in rejected by user")
    render(<SignInButton error={error} />)
    expect(screen.getByRole("button", { name: /retry sign in/i })).toBeTruthy()
    expect(screen.getByText("Sign-in rejected by user")).toBeTruthy()
  })

  it("calls onSignIn when retry button clicked", () => {
    const onSignIn = vi.fn()
    const error = new Error("Something went wrong")
    render(<SignInButton error={error} onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole("button", { name: /retry sign in/i }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
  })

  it("renders error message below the button", () => {
    const error = new Error("Connection failed: user rejected the signature request")
    const { container } = render(<SignInButton error={error} />)
    expect(container.textContent).toContain("Connection failed: user rejected the signature request")
  })

  it("does not render dismiss button in error state", () => {
    const error = new Error("Some error")
    const { container } = render(<SignInButton error={error} onClearError={vi.fn()} />)
    // The dismiss X button should not appear
    expect(container.querySelector('[title="Dismiss error"]')).toBeNull()
    // No X icon from lucide-react
    expect(container.textContent).not.toContain("Dismiss")
  })

  it("wraps long error messages without overflow", () => {
    const longMessage = "x".repeat(200)
    const error = new Error(longMessage)
    const { container } = render(<SignInButton error={error} />)
    // The long text should be present in the rendered output
    expect(container.textContent).toContain(longMessage)
  })

  // ===== Signed-in state =====
  it("renders Signed In when isSignedIn is true", () => {
    render(<SignInButton isSignedIn={true} />)
    // The signed-in button shows "Signed In" text
    expect(screen.getByText("Signed In")).toBeTruthy()
  })

  it("shows domain and chain in details when Signed In button is clicked", async () => {
    const result = createMockResult()
    render(<SignInButton isSignedIn={true} result={result} />)

    // Click the Signed In button
    const btn = screen.getByRole("button", { name: /signed in/i })
    await act(async () => {
      fireEvent.click(btn)
    })

    // Should show details
    expect(await screen.findByText("example.com")).toBeTruthy()
    expect(await screen.findByText("eip155:1")).toBeTruthy()
  })

  it("shows address in details", async () => {
    const result = createMockResult()
    render(<SignInButton isSignedIn={true} result={result} />)
    const btn = screen.getByRole("button", { name: /signed in/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(await screen.findByText(/0x1234567890abcdef/)).toBeTruthy()
  })

  it("shows statement in details when present", async () => {
    const result = createMockResult()
    render(<SignInButton isSignedIn={true} result={result} />)
    const btn = screen.getByRole("button", { name: /signed in/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(await screen.findByText("Sign in to access the app")).toBeTruthy()
  })

  it("shows generic authenticated message when result is null but signed in", async () => {
    render(<SignInButton isSignedIn={true} result={null} />)
    const btn = screen.getByRole("button", { name: /signed in/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(await screen.findByText("Authenticated successfully")).toBeTruthy()
  })

  // ===== Edge cases =====
  it("shows signed-in state when both isSignedIn and error are true", () => {
    const error = new Error("Some error")
    render(<SignInButton isSignedIn={true} error={error} />)
    expect(screen.getByRole("button", { name: /signed in/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /retry sign in/i })).toBeNull()
  })
})
