/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock("@naculus/connect-appkit-react", () => ({
  usePassphraseGate: () => state.value,
}))

import { PassphraseDialog } from "./PassphraseDialog"

function setup(request: unknown) {
  const submit = vi.fn()
  const cancel = vi.fn()
  state.value = { request, submit, cancel }
  return { submit, cancel }
}

function type(label: RegExp | string, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  return input
}

describe("PassphraseDialog", () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it("renders nothing when nothing is waiting on an answer", () => {
    setup(null)
    const { container } = render(<PassphraseDialog />)
    expect(container.firstChild).toBeNull()
  })

  it("asks for an existing passphrase on unlock, with no confirm field", () => {
    setup({ intent: "unlock", previousError: null })
    render(<PassphraseDialog />)
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "Unlock your wallet",
    )
    expect(screen.queryByText("Type it again")).toBeNull()
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true")
    expect(document.querySelector("[data-dialog-actions]")).not.toBeNull()
  })

  it("asks for a new passphrase on create, with a confirm field", () => {
    setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "Choose a passphrase",
    )
    expect(screen.getByText("Type it again")).toBeDefined()
  })

  // A dialog that reappears with no explanation reads as a bug, and the user
  // retypes the value that just failed.
  it("says why the last passphrase was discarded", () => {
    setup({
      intent: "unlock",
      previousError: "That passphrase did not open the wallet.",
    })
    render(<PassphraseDialog />)
    expect(screen.getByRole("alert").textContent).toContain(
      "did not open the wallet",
    )
  })

  it("submits what was typed", () => {
    const { submit } = setup({ intent: "unlock", previousError: null })
    render(<PassphraseDialog />)
    type("Passphrase", "let me in please")
    fireEvent.click(screen.getByText("Unlock"))
    expect(submit).toHaveBeenCalledWith("let me in please")
  })

  it("refuses a passphrase under the minimum length", () => {
    const { submit } = setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    type("Passphrase", "short")
    expect(screen.getByText("At least 8 characters.")).toBeDefined()
    fireEvent.click(screen.getByText("Encrypt wallet"))
    expect(submit).not.toHaveBeenCalled()
  })

  it("refuses a mismatched confirmation", () => {
    const { submit } = setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    type("Passphrase", "four random words")
    type("Type it again", "four random word")
    expect(screen.getByText("These do not match.")).toBeDefined()
    fireEvent.click(screen.getByText("Encrypt wallet"))
    expect(submit).not.toHaveBeenCalled()
  })

  it("accepts a matching passphrase of sufficient length", () => {
    const { submit } = setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    type("Passphrase", "four random words")
    type("Type it again", "four random words")
    fireEvent.click(screen.getByText("Encrypt wallet"))
    expect(submit).toHaveBeenCalledWith("four random words")
  })

  // This is the sentence that decides whether someone can recover. It has to
  // be on screen when they choose the passphrase, not in a document.
  it("says the recovery phrase is the only way back", () => {
    setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    expect(screen.getByText(/recovery phrase is the only thing/)).toBeDefined()
  })

  it("does not put that warning on the unlock prompt", () => {
    setup({ intent: "unlock", previousError: null })
    render(<PassphraseDialog />)
    expect(screen.queryByText(/recovery phrase is the only thing/)).toBeNull()
  })

  it("advises length over symbols for a short-but-valid passphrase", () => {
    setup({ intent: "create", previousError: null })
    render(<PassphraseDialog />)
    type("Passphrase", "P@ssw0rd")
    expect(screen.getByText(/Several ordinary words/)).toBeDefined()
  })

  it("can reveal what was typed", () => {
    setup({ intent: "unlock", previousError: null })
    render(<PassphraseDialog />)
    const input = type("Passphrase", "secret") as HTMLInputElement
    expect(input.type).toBe("password")
    fireEvent.click(screen.getByLabelText("Show passphrase"))
    expect(screen.getByLabelText("Hide passphrase").className).toContain(
      "naculus-hit-target",
    )
    expect(
      (screen.getByLabelText("Passphrase") as HTMLInputElement).type,
    ).toBe("text")
  })

  it("fails the waiting operation when cancelled", () => {
    const { cancel } = setup({ intent: "unlock", previousError: null })
    render(<PassphraseDialog />)
    fireEvent.click(screen.getByText("Cancel"))
    expect(cancel).toHaveBeenCalled()
  })

  // Carrying it over would re-offer a passphrase that was just rejected.
  it("clears the field when a new prompt opens", () => {
    setup({ intent: "unlock", previousError: null })
    const { rerender } = render(<PassphraseDialog />)
    type("Passphrase", "first attempt")
    setup({ intent: "unlock", previousError: "That passphrase did not open the wallet." })
    rerender(<PassphraseDialog />)
    expect(
      (screen.getByLabelText("Passphrase") as HTMLInputElement).value,
    ).toBe("")
  })
})
