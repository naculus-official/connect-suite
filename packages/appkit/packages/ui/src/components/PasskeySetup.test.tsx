/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const state = vi.hoisted(() => ({
  web3: {} as Record<string, unknown>,
  embedded: {} as Record<string, unknown>,
}))

vi.mock("@naculus/connect-appkit-react", () => ({
  useWeb3: () => state.web3,
  useEmbeddedWallet: () => state.embedded,
}))

import { PasskeySetup } from "./PasskeySetup"

type PrfState = "unknown" | "available" | "unavailable" | "none"

function setup(opts: {
  passkeys?: boolean
  hasCredential?: boolean
  prf?: PrfState
  sealedWith?: string[] | null
  hasWallet?: boolean
} = {}) {
  const createPasskey = vi.fn(async () => ({ id: "c1", prfSupported: true }))
  const save = vi.fn(async () => {})
  const passkeysConnector = opts.passkeys === false
    ? null
    : {
        hasCredential: () => opts.hasCredential ?? false,
        createPasskey,
      }
  state.web3 = {
    client: { passkeysConnector, embeddedConnector: { save } },
  }
  state.embedded = {
    hasWallet: opts.hasWallet ?? true,
    securityReport: opts.prf
      ? {
          unlock: { prf: opts.prf, sealedWith: opts.sealedWith ?? null },
        }
      : null,
  }
  return { createPasskey, save }
}

describe("PasskeySetup", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it("renders nothing when passkeys are not enabled", () => {
    setup({ passkeys: false })
    const { container } = render(<PasskeySetup />)
    expect(container.firstChild).toBeNull()
  })

  it("offers registration when no credential exists", () => {
    setup({ hasCredential: false })
    render(<PasskeySetup />)
    expect(screen.getByText("Protect with a passkey")).toBeDefined()
  })

  // Said where the decision is made, not in a document nobody opens.
  it("says a passkey is not a backup, at the moment of enabling", () => {
    setup({ hasCredential: false })
    render(<PasskeySetup />)
    expect(
      screen.getByText(/recovery phrase is still the only thing/),
    ).toBeDefined()
  })

  it("says the passphrase keeps working", () => {
    setup({ hasCredential: false })
    render(<PasskeySetup />)
    expect(screen.getByText(/passphrase keeps working/)).toBeDefined()
  })

  it("registers and re-seals the stored record", async () => {
    const { createPasskey, save } = setup({ hasCredential: false })
    render(<PasskeySetup />)
    fireEvent.click(screen.getByText("Protect with a passkey"))
    await waitFor(() => expect(createPasskey).toHaveBeenCalled())
    await waitFor(() => expect(save).toHaveBeenCalled())
  })

  it("does not try to re-seal when there is no wallet yet", async () => {
    const { createPasskey, save } = setup({ hasCredential: false, hasWallet: false })
    render(<PasskeySetup />)
    fireEvent.click(screen.getByText("Protect with a passkey"))
    await waitFor(() => expect(createPasskey).toHaveBeenCalled())
    expect(save).not.toHaveBeenCalled()
  })

  it("surfaces a declined or failed registration", async () => {
    const { createPasskey } = setup({ hasCredential: false })
    createPasskey.mockRejectedValue(new Error("Passkey creation was cancelled"))
    render(<PasskeySetup />)
    fireEvent.click(screen.getByText("Protect with a passkey"))
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("cancelled"),
    )
  })

  it("confirms when the passkey is registered and applied", () => {
    setup({ hasCredential: true, prf: "available", sealedWith: ["prf", "passphrase"] })
    render(<PasskeySetup />)
    expect(screen.getByText("Your passkey unlocks this wallet")).toBeDefined()
  })

  it("says a re-seal is still pending when the record predates the passkey", () => {
    setup({ hasCredential: true, prf: "available", sealedWith: ["passphrase"] })
    render(<PasskeySetup />)
    expect(screen.getByText("Registered, but not applied yet")).toBeDefined()
  })

  // Cannot be added to an existing credential, so a generic success message
  // would leave someone believing they are protected when they are not.
  it("says plainly when the passkey cannot unlock the wallet", () => {
    setup({ hasCredential: true, prf: "unavailable", sealedWith: ["passphrase"] })
    render(<PasskeySetup />)
    expect(
      screen.getByText("This passkey cannot unlock the wallet"),
    ).toBeDefined()
    expect(screen.getByText(/new one has to be registered/)).toBeDefined()
  })

  // Not having asked is not the same answer as the authenticator saying no.
  it("does not claim failure before anything has been checked", () => {
    setup({ hasCredential: true, prf: "unknown", sealedWith: null })
    render(<PasskeySetup />)
    expect(screen.getByText("A passkey is registered")).toBeDefined()
    expect(screen.getByText(/not known until the wallet is opened/)).toBeDefined()
    expect(
      screen.queryByText("This passkey cannot unlock the wallet"),
    ).toBeNull()
  })

  it("treats a missing report the same way — unknown, not no", () => {
    setup({ hasCredential: true })
    render(<PasskeySetup />)
    expect(screen.getByText("A passkey is registered")).toBeDefined()
  })
})
