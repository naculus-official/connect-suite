/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock("@naculus/connect-appkit-react", () => ({
  useEmbeddedWallet: () => state.value,
}))

import { WalletSecurityPanel } from "./WalletSecurityPanel"

const BEST_CASE = {
  level: 1,
  score: 95,
  backend: "indexedDb",
  encrypted: true,
  unlock: { prf: "available", sealedWith: ["prf", "passphrase"] },
  findings: [
    {
      id: "passphrase-recovery-retained",
      severity: "info",
      deduction: 5,
      title: "A passphrase can still open this wallet",
      detail: "Only as hard to open as the passphrase.",
      remedy: "This is a deliberate trade.",
    },
    {
      id: "hot-wallet-signing-exposure",
      severity: "info",
      deduction: 0,
      title: "The signing key is in memory while it signs",
      detail: "This is what a hot wallet is.",
    },
  ],
}

describe("WalletSecurityPanel", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it("renders nothing before a wallet exists", () => {
    state.value = { securityReport: null }
    const { container } = render(<WalletSecurityPanel />)
    expect(container.firstChild).toBeNull()
  })

  it("shows the score and the tier behind it", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel />)
    expect(screen.getByText("95")).toBeDefined()
    expect(screen.getByText("Tier 1")).toBeDefined()
  })

  // The whole reason this panel exists: a number without the reason is worse
  // than no number.
  it("attaches every lost point to the sentence that explains it", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel />)
    expect(
      screen.getByText("A passphrase can still open this wallet"),
    ).toBeDefined()
    expect(screen.getByText("−5")).toBeDefined()
    expect(screen.getByText(/deliberate trade/)).toBeDefined()
  })

  it("does not put a deduction badge on an informational finding", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel />)
    expect(screen.queryByText("−0")).toBeNull()
  })

  it("says the rubric is this SDK's own, not an external standard", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel />)
    expect(screen.getByText(/own published rubric/)).toBeDefined()
  })

  // Costs no points but is the one users most need to read.
  it("keeps the hot-wallet exposure visible by default", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel />)
    expect(
      screen.getByText("The signing key is in memory while it signs"),
    ).toBeDefined()
  })

  it("can hide zero-cost findings when asked", () => {
    state.value = { securityReport: BEST_CASE }
    render(<WalletSecurityPanel hideInformational />)
    expect(
      screen.queryByText("The signing key is in memory while it signs"),
    ).toBeNull()
  })

  it("summarizes the backend and encryption state", () => {
    state.value = {
      securityReport: {
        ...BEST_CASE,
        backend: "localStorage",
        encrypted: false,
        unlock: { prf: "none", sealedWith: null },
      },
    }
    render(<WalletSecurityPanel />)
    expect(screen.getByText(/localStorage · not encrypted/)).toBeDefined()
  })

  it("reports a clean result without an unexplained caveat", () => {
    state.value = {
      securityReport: {
        ...BEST_CASE,
        score: 100,
        findings: [BEST_CASE.findings[1]],
      },
    }
    render(<WalletSecurityPanel />)
    expect(
      screen.getByText("Nothing is holding this score down."),
    ).toBeDefined()
  })
})
