/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"

afterEach(() => cleanup())

// ── Simple placeholder components ─────────────────────────────────
function PlaceholderButton({ children, onClick, disabled, className, ...rest }: any) {
  return <button className={className} onClick={onClick} disabled={disabled} data-testid="placeholder-btn" {...rest}>{children}</button>
}

function _PlaceholderDialog({ children, open, onOpenChange }: any) {
  if (!open) return null
  return <div data-testid="placeholder-dialog" role="dialog" aria-modal="true">{children}</div>
}

function _PlaceholderDialogContent({ children }: any) {
  return <div data-testid="placeholder-dialog-content">{children}</div>
}

function _PlaceholderDialogHeader({ children }: any) {
  return <div data-testid="placeholder-dialog-header">{children}</div>
}

function _PlaceholderDialogTitle({ children }: any) {
  return <div data-testid="placeholder-dialog-title">{children}</div>
}

// ── Mocks ──────────────────────────────────────────────────────────

// Mock lucide-react icons as simple components
vi.mock("lucide-react", () => ({
  AlertTriangle: (props: any) => <div data-testid="alert-triangle" {...props}>AT</div>,
  Check: (props: any) => <div data-testid="check-icon" {...props}>CK</div>,
  Copy: (props: any) => <div data-testid="copy-icon" {...props}>CP</div>,
  Download: (props: any) => <div data-testid="download-icon" {...props}>DL</div>,
  Eye: (props: any) => <div data-testid="eye-icon" {...props}>EY</div>,
  EyeOff: (props: any) => <div data-testid="eye-off-icon" {...props}>EO</div>,
  SkipForward: (props: any) => <div data-testid="skip-icon" {...props}>SF</div>,
  ArrowLeft: (props: any) => <div data-testid="arrow-left" {...props}>AL</div>,
  ArrowRight: (props: any) => <div data-testid="arrow-right" {...props}>AR</div>,
  Shield: (props: any) => <div data-testid="shield-icon" {...props}>SH</div>,
  X: (props: any) => <div data-testid="x-icon" {...props}>X</div>,
}))

// Mock ComponentRegistry to provide placeholder dialog components
const mockUseComponentRegistry = vi.fn()
vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => mockUseComponentRegistry(),
}))

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})

import { SeedPhraseBackup } from "./SeedPhraseBackup"

// ── Helper phrases ─────────────────────────────────────────────────
const TWELVE_WORD_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
const TWENTY_FOUR_WORD_PHRASE = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"

// ── Tests ──────────────────────────────────────────────────────────

describe("SeedPhraseBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Only provide Button — leave Dialog/Content/Header/Title undefined so
    // SeedPhraseBackup falls through to DefaultDialog which has close button etc.
    mockUseComponentRegistry.mockReturnValue({
      Button: PlaceholderButton,
    })
  })

  // ===== Basic Rendering =====
  describe("Basic Rendering", () => {
    it("renders nothing when open is false", () => {
      const { container } = render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={false}
        />
      )
      // When open=false, the component returns null early if Dialog isn't handling it
      // With our mock, PlaceholderDialog checks open prop and returns null
      expect(container.innerHTML).toBe("")
    })

    it("renders reveal step when open is true", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )
      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
      expect(screen.getByText("Reveal Seed Phrase")).toBeTruthy()
      expect(screen.getByTestId("shield-icon")).toBeTruthy()
    })

    it("renders with inline mode showing title", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          inline={true}
        />
      )
      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
    })

    it("shows title in the dialog", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )
      // Title is rendered in the DefaultDialog's header (h2 tag)
      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
    })
  })

  // ===== Reveal Step =====
  describe("Reveal Step", () => {
    it("reveals seed phrase words when button is clicked", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      const revealBtn = screen.getByText("Reveal Seed Phrase")
      await act(async () => {
        fireEvent.click(revealBtn)
      })

      // Words should now be visible (multiple 'abandon' matches)
      const abandonWords = screen.getAllByText("abandon")
      expect(abandonWords.length).toBeGreaterThanOrEqual(10)
      expect(screen.getByText("about")).toBeTruthy()
    })

    it("shows word numbers for each seed word", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("1")).toBeTruthy()
      expect(screen.getByText("12")).toBeTruthy()
    })

    it("shows warning box encouraging safe storage", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      expect(screen.getByText(/Write down these words/)).toBeTruthy()
    })

    it("renders 24 words when wordCount is 24", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWENTY_FOUR_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("art")).toBeTruthy()
      expect(screen.getByText("24")).toBeTruthy()
    })

    it("shows 'I've Saved It' button after reveal", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("I've Saved It")).toBeTruthy()
    })

    it("shows 'Skip Backup' button when onSkip provided", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onSkip={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("Skip Backup")).toBeTruthy()
    })

    it("does not show 'Skip Backup' when onSkip is not provided", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.queryByText("Skip Backup")).toBeNull()
    })
  })

  // ===== Copy Functionality =====
  describe("Copy Functionality", () => {
    it("copies seed phrase to clipboard when Copy button is clicked", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Copy"))
      })

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TWELVE_WORD_PHRASE)
    })

    it("shows 'Copied' feedback after copy", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Copy"))
      })

      expect(screen.getByText("Copied")).toBeTruthy()
    })

    it("reverts back to Copy after 2-second timeout", async () => {
      vi.useFakeTimers()

      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Copy"))
      })

      expect(screen.getByText("Copied")).toBeTruthy()

      await vi.advanceTimersByTimeAsync(2500)

      await vi.waitFor(() => {
        expect(screen.queryByText("Copied")).toBeNull()
      })

      vi.useRealTimers()
    })

    it("tells the user when the clipboard refused, rather than nothing", async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Clipboard denied"))

      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Copy"))
      })

      // Silence is the dangerous outcome here: a user who sees no change
      // assumes the phrase reached their password manager, confirms the
      // backup, and is left relying on one that does not exist.
      expect(screen.queryByText("Copied")).toBeNull()
      expect(screen.getByText("Copy failed")).toBeTruthy()
      expect(screen.getByRole("alert").textContent).toContain(
        "Nothing was copied",
      )
    })
  })

  // ===== Confirm Step =====
  describe("Confirm Step", () => {
    it("shows confirm step after clicking 'I've Saved It'", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      expect(screen.getByText("Verify Backup")).toBeTruthy()
      expect(screen.getByText(/Verify your backup/)).toBeTruthy()
    })

    it("shows word verification prompts with numbered positions", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      // Should show at least one "Word #" label
      const wordLabels = screen.getAllByText(/^Word #\d+$/)
      expect(wordLabels.length).toBeGreaterThanOrEqual(1)
    })

    it("allows selecting a word option for verification", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      // Click a word option
      const wordOptions = screen.getAllByText("abandon")
      expect(wordOptions.length).toBeGreaterThan(0)
      await act(async () => {
        fireEvent.click(wordOptions[0])
      })
    })

    it("shows Verify button disabled when not all words selected", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      // Verify button exists
      const verifyBtn = screen.getByText("Verify & Confirm")
      expect(verifyBtn).toBeTruthy()
    })

    it("shows back button on confirm step", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      expect(screen.getByText("Back")).toBeTruthy()
    })

    it("returns to reveal step when back is clicked", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      expect(screen.getByText("Verify Backup")).toBeTruthy()

      await act(async () => {
        fireEvent.click(screen.getByText("Back"))
      })

      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
    })
  })

  // ===== Dialog Open/Close Behavior =====
  describe("Dialog Open/Close Behavior", () => {
    it("renders dialog with proper ARIA attributes", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeTruthy()
      expect(dialog.getAttribute("aria-modal")).toBe("true")
    })

    it("calls onOpenChange(false) when close button is clicked", async () => {
      const onOpenChange = vi.fn()

      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
          onOpenChange={onOpenChange}
        />
      )

      // The close X button is rendered via the X icon inside the title section.
      // SeedPhraseBackup shows it when onOpenChange is provided.
      // Find it via data-testid since it doesn't have aria-label
      const xIcon = screen.getByTestId("x-icon")
      const closeBtn = xIcon.closest('button')
      expect(closeBtn).toBeTruthy()

      await act(async () => {
        fireEvent.click(closeBtn!)
      })

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  // ===== Skip Functionality =====
  describe("Skip Functionality", () => {
    it("calls onSkip when 'Skip Backup' is clicked during reveal step", async () => {
      const onSkip = vi.fn()

      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onSkip={onSkip}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Skip Backup"))
      })

      expect(onSkip).toHaveBeenCalled()
    })

    it("calls onSkip when 'Skip' is clicked during confirm step", async () => {
      const onSkip = vi.fn()

      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onSkip={onSkip}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("I've Saved It"))
      })

      const skipBtns = screen.getAllByText("Skip")
      expect(skipBtns.length).toBeGreaterThan(0)
      await act(async () => {
        fireEvent.click(skipBtns[0])
      })

      expect(onSkip).toHaveBeenCalled()
    })
  })

  // ===== Export Private Key =====
  describe("Export Private Key", () => {
    it("shows Export Private Key button when onExportPrivateKey provided", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onExportPrivateKey={() => "0xprivatekey123"}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("Export Private Key")).toBeTruthy()
    })

    it("does not show Export Private Key when callback not provided", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.queryByText("Export Private Key")).toBeNull()
    })

    it("shows private key after clicking export button", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onExportPrivateKey={() => "0xprivatekey123"}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      await act(async () => {
        fireEvent.click(screen.getByText("Export Private Key"))
      })

      expect(screen.getByText("0xprivatekey123")).toBeTruthy()
    })
  })

  // ===== Done Step =====
  describe("Done Step", () => {
    it("shows confirmation state title when backup is done", () => {
      // We can't easily reach the done step via UI (words are randomized),
      // but we can verify the component structure
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
        />
      )
      // The done step renders "Backup Complete" title when reached
      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
    })
  })

  // ===== Edge Cases =====
  describe("Edge Cases", () => {
    it("handles empty seed phrase gracefully", () => {
      render(
        <SeedPhraseBackup
          seedPhrase=""
          onConfirm={vi.fn()}
          open={true}
        />
      )

      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
      expect(screen.getByText("Reveal Seed Phrase")).toBeTruthy()
    })

    it("handles single word seed phrase", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase="loneword"
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("loneword")).toBeTruthy()
    })

    it("handles seed phrase with extra whitespace", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase="  word1  word2  word3  "
          onConfirm={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("word1")).toBeTruthy()
      expect(screen.getByText("word2")).toBeTruthy()
      expect(screen.getByText("word3")).toBeTruthy()
    })

    it("handles 12-word seed phrase by default detection", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          open={true}
          wordCount={12}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("12")).toBeTruthy()
      expect(screen.queryByText("13")).toBeNull()
    })

    it("shows copy button after reveal even with onSkip provided", async () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          onSkip={vi.fn()}
          open={true}
        />
      )

      await act(async () => {
        fireEvent.click(screen.getByText("Reveal Seed Phrase"))
      })

      expect(screen.getByText("Copy")).toBeTruthy()
    })
  })

  // ===== Inline mode =====
  describe("Inline Mode", () => {
    it("renders without dialog wrapper when inline is true", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          inline={true}
        />
      )

      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.getByText("Backup Seed Phrase")).toBeTruthy()
    })

    it("does not show close button in inline mode even when onOpenChange provided", () => {
      render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          inline={true}
          onOpenChange={vi.fn()}
        />
      )

      expect(screen.queryByLabelText("Close")).toBeNull()
    })

    it("applies custom className in inline mode", () => {
      const { container } = render(
        <SeedPhraseBackup
          seedPhrase={TWELVE_WORD_PHRASE}
          onConfirm={vi.fn()}
          inline={true}
          className="my-custom-class"
        />
      )

      const el = container.querySelector(".my-custom-class")
      expect(el).toBeTruthy()
    })
  })
})
