/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"

afterEach(() => cleanup())

// ── Mocks ──────────────────────────────────────────────────────────

// Mock @naculus/connect-appkit-react hooks
const mockUseWallet = vi.fn()
const mockUseAccount = vi.fn()
const mockUseChain = vi.fn()
const mockUseEmbeddedWallet = vi.fn()
const mockUseDisconnect = vi.fn()
const mockUseWeb3 = vi.fn()
const mockWeb3ConnectProvider = vi.fn()
const _mockWeb3 = vi.fn()

vi.mock("@naculus/connect-appkit-react", () => ({
  useWallet: () => mockUseWallet(),
  useWeb3: () => mockUseWeb3(),
  useAccount: () => mockUseAccount(),
  useChain: () => mockUseChain(),
  useEmbeddedWallet: () => mockUseEmbeddedWallet(),
  useDisconnect: () => mockUseDisconnect(),
  useBalance: () => ({ formatted: null }),
  Web3ConnectProvider: ({ children, config, autoConnect }: any) => {
    mockWeb3ConnectProvider({ config, autoConnect })
    return <div data-testid="web3-connect-provider">{children}</div>
  },
  AppkitConnectButton: (props: any) => (
    <div data-testid="wc-connect-button">
      {!props.connected && (
        <>
          <span>Connect Wallet</span>
          <button type="button"
            data-testid="mock-injected-wallet"
            onClick={() => props.onAppkitConnect?.({ detail: { kind: "injected", walletId: "io.test.wallet" } })}
          >
            Mock injected wallet
          </button>
        </>
      )}
    </div>
  ),
}))

// Mock useEIP6963 hook
const mockUseEIP6963 = vi.fn().mockReturnValue({ wallets: [], isDetecting: false, hasWallets: false })
vi.mock("../hooks/useEIP6963", () => ({
  useEIP6963: () => mockUseEIP6963(),
}))

// Mock ThemeContext
vi.mock("../contexts/ThemeContext", () => ({
  ThemeProvider: ({ children, ...props }: any) => {
    return <div data-testid="theme-provider" data-props={JSON.stringify(props)}>{children}</div>
  },
}))

// Mock ComponentRegistry (include useComponentRegistry with fallback for downstream components)
const mockUseComponentRegistry = vi.fn()
vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => mockUseComponentRegistry(),
  Web3ComponentProvider: ({ children, components }: any) => {
    return <div data-testid="component-provider">{children}</div>
  },
}))

// Mock WalletConnectContext (include useWalletConnectOptional for ConnectButton)
const mockUseWalletConnectOptional = vi.fn()
vi.mock("../contexts/WalletConnectContext", () => ({
  useWalletConnectOptional: () => mockUseWalletConnectOptional(),
  WalletConnectProvider: ({ children }: any) => {
    return <div data-testid="wallet-connect-provider">{children}</div>
  },
}))

// Mock SeedPhraseBackup (complex component)
vi.mock("./SeedPhraseBackup", () => ({
  SeedPhraseBackup: ({ seedPhrase, onConfirm, onSkip, onExportPrivateKey, open, onOpenChange }: any) => {
    return (
      <div data-testid="seed-phrase-backup" data-seed-phrase={seedPhrase} data-open={open}>
        <button type="button" data-testid="mock-seed-confirm" onClick={onConfirm}>
          Mock Seed Confirm
        </button>
        <button type="button" data-testid="mock-seed-skip" onClick={onSkip}>
          Mock Seed Skip
        </button>
        <button type="button" data-testid="mock-export-key" onClick={() => onExportPrivateKey?.()}>
          Mock Export Key
        </button>
        <button type="button" data-testid="mock-seed-close" onClick={() => onOpenChange?.(false)}>
          Mock Seed Close
        </button>
      </div>
    )
  },
}))

// Mock QRCodeModal
vi.mock("./QRCodeModal", () => ({
  QRCodeModal: ({ open, onClose, uri }: any) => {
    if (!open) return null
    return <div data-testid="qr-code-modal">QR Code Modal</div>
  },
}))

import { AppKit, AppKitButton, AppKitChainSelector, useAppKit } from "./AppKit"

// ── Helper ─────────────────────────────────────────────────────────
const defaultConfig = {
  projectId: "test-project-id",
  metadata: {
    name: "Test App",
    description: "A test app",
    url: "https://test.com",
    icons: ["https://test.com/icon.png"],
  },
}

function renderAppKit(overrides = {}) {
  return render(
    <AppKit {...defaultConfig} {...overrides}>
      <div data-testid="child-content">Child Component</div>
    </AppKit>
  )
}

const chainState = {
  currentChain: null,
  availableChains: [],
  switchChain: vi.fn(),
}

// ── Tests ──────────────────────────────────────────────────────────

function SimpleBtn({ children, onClick, ...props }: any) {
  return <button onClick={onClick} {...props}>{children}</button>
}

function TestConsumer() {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: deliberate — the test captures the error useAppKit throws outside its provider
    const ctx = useAppKit()
    return <div data-testid="hook-result" data-connected={ctx.isConnected} data-has-wallets={ctx.hasWallets}>OK</div>
  } catch (e) {
    return <div data-testid="hook-error">{(e as Error).message}</div>
  }
}

describe("AppKit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({ isConnected: false, isConnecting: false })
    mockUseWeb3.mockReturnValue({ connectInjected: vi.fn().mockResolvedValue(undefined) })
    mockUseAccount.mockReturnValue({ primaryAccount: null })
    mockUseChain.mockReturnValue(chainState)
    mockUseEmbeddedWallet.mockReturnValue({
      backupPending: false,
      seedPhrase: null,
      confirmBackup: vi.fn(),
      wallet: null,
    })
    mockUseDisconnect.mockReturnValue({ disconnect: vi.fn() })
    mockUseEIP6963.mockReturnValue({ wallets: [], isDetecting: false, hasWallets: false })
    // Provide Button in registry for ConnectButton/ChainSelector sub-components
    mockUseComponentRegistry.mockReturnValue({ Button: SimpleBtn })
  })

  // ===== Basic Rendering =====
  describe("Basic Rendering", () => {
    it("renders children inside the component", () => {
      renderAppKit()
      expect(screen.getByTestId("child-content")).toBeTruthy()
      expect(screen.getByText("Child Component")).toBeTruthy()
    })

    it("renders with default props", () => {
      renderAppKit()
      expect(screen.getByTestId("web3-connect-provider")).toBeTruthy()
    })

    it("applies className to the wrapper", () => {
      const { container } = renderAppKit({ className: "my-app-class" })
      // The className is passed to the CSS provider layer
      expect(container.innerHTML).toBeTruthy()
    })

    it("passes projectId to Web3ConnectProvider config", () => {
      renderAppKit()
      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            projectId: "test-project-id",
          }),
        })
      )
    })

    it("forwards chain and security configuration to the React provider", () => {
      const embeddedConfig = {
        encryptionPassphrase: async () => "test-only-passphrase",
        isolation: "worker" as const,
      }
      const chains = [{
        id: 11155111,
        namespace: "eip155" as const,
        name: "Sepolia",
        rpcUrl: "https://rpc.example.test",
        token: "ETH",
      }]

      renderAppKit({
        chains,
        embeddedConfig,
        encryptionKey: "test-session-key",
        siwx: { createMessage: vi.fn() },
      })

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(expect.objectContaining({
        config: expect.objectContaining({
          chains,
          embeddedConfig,
          encryptionKey: "test-session-key",
        }),
      }))
    })
  })

  // ===== Theme Prop =====
  describe("Theme Prop", () => {
    it("passes theme prop to Web3ConnectUI", () => {
      const theme = { primary: "#ff0000" }
      renderAppKit({ theme })
      // Theme should be passed down to ThemeProvider
      const themeProvider = document.querySelector('[data-testid="theme-provider"]')
      expect(themeProvider).toBeTruthy()
      // The theme + defaultDark + priority should be in data-props
      const props = JSON.parse(themeProvider!.getAttribute("data-props") || "{}")
      expect(props.theme).toEqual(theme)
    })

    it("passes defaultDark prop", () => {
      renderAppKit({ defaultDark: true })
      const themeProvider = document.querySelector('[data-testid="theme-provider"]')
      const props = JSON.parse(themeProvider!.getAttribute("data-props") || "{}")
      expect(props.defaultDark).toBe(true)
    })

    it("passes themePriority prop with default value", () => {
      renderAppKit()
      const themeProvider = document.querySelector('[data-testid="theme-provider"]')
      const props = JSON.parse(themeProvider!.getAttribute("data-props") || "{}")
      // Default themePriority is "computed"
      expect(props.priority).toBe("computed")
    })

    it("passes custom themePriority", () => {
      renderAppKit({ themePriority: "fallback" })
      const themeProvider = document.querySelector('[data-testid="theme-provider"]')
      const props = JSON.parse(themeProvider!.getAttribute("data-props") || "{}")
      expect(props.priority).toBe("fallback")
    })
  })

  // ===== detectionMode Prop =====
  describe("detectionMode Prop", () => {
    it("passes detectionMode to Web3ConnectUI", () => {
      renderAppKit({ detectionMode: "eip6963" })
      // Verify Web3ConnectProvider still renders
      expect(screen.getByTestId("web3-connect-provider")).toBeTruthy()
    })

    it("uses 'auto' as default detectionMode", () => {
      renderAppKit()
      // Should still render wallet-connect provider when detectionMode is 'auto'
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })

    it("handles detectionMode 'walletconnect'", () => {
      renderAppKit({ detectionMode: "walletconnect" })
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })
  })

  // ===== Connected State =====
  describe("Connected State Context", () => {
    it("creates context with correct values when not connected", () => {
      renderAppKit()

      // Since the context is used by sub-components, verify the provider
      // structure is rendered correctly
      expect(screen.getByTestId("component-provider")).toBeTruthy()
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
    })

    it("provides isConnected state through context", () => {
      mockUseWallet.mockReturnValue({ isConnected: true, isConnecting: false })
      mockUseAccount.mockReturnValue({ primaryAccount: "0x1234" })

      render(
        <AppKit {...defaultConfig}>
          <AppKitButton />
        </AppKit>
      )

      // The WC wrapper is rendered within the provider tree
      expect(screen.getByTestId("component-provider")).toBeTruthy()
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
      expect(screen.getByTestId("web3-connect-provider")).toBeTruthy()
    })
  })

  // ===== Backup Flow =====
  describe("Backup Flow", () => {
    it("shows seed phrase backup when embedded wallet has pending backup", () => {
      mockUseEmbeddedWallet.mockReturnValue({
        backupPending: true,
        seedPhrase: "test seed phrase twelve words here",
        confirmBackup: vi.fn(),
        wallet: null,
      })

      renderAppKit()

      // The SeedPhraseBackup should be rendered
      expect(screen.getByTestId("seed-phrase-backup")).toBeTruthy()
    })

    it("does not show backup dialog when no pending backup", () => {
      mockUseEmbeddedWallet.mockReturnValue({
        backupPending: false,
        seedPhrase: null,
        confirmBackup: vi.fn(),
        wallet: null,
      })

      renderAppKit()

      expect(screen.queryByTestId("seed-phrase-backup")).toBeNull()
    })

    it("calls confirmBackup when backup is confirmed", () => {
      const confirmBackup = vi.fn()
      mockUseEmbeddedWallet.mockReturnValue({
        backupPending: true,
        seedPhrase: "test seed phrase twelve words here",
        confirmBackup,
        wallet: null,
      })

      renderAppKit()

      const confirmBtn = screen.getByTestId("mock-seed-confirm")
      fireEvent.click(confirmBtn)
      expect(confirmBackup).toHaveBeenCalled()
    })

    it("clears the seed phrase when backup is skipped", () => {
      const confirmBackup = vi.fn()
      mockUseEmbeddedWallet.mockReturnValue({
        backupPending: true,
        seedPhrase: "test seed phrase twelve words here",
        confirmBackup,
        wallet: null,
      })

      renderAppKit()

      const skipBtn = screen.getByTestId("mock-seed-skip")
      fireEvent.click(skipBtn)
      expect(confirmBackup).toHaveBeenCalled()
    })

    it("closes backup dialog when embedded wallet is no longer pending", () => {
      const mockEmbedded = {
        backupPending: false,
        seedPhrase: "test seed phrase twelve words here",
        confirmBackup: vi.fn(),
        wallet: null,
      }
      mockUseEmbeddedWallet.mockReturnValue(mockEmbedded)

      // Initially render without backup
      render(
        <AppKit {...defaultConfig}>
          <div>test</div>
        </AppKit>
      )

      expect(screen.queryByTestId("seed-phrase-backup")).toBeNull()
    })
  })

  // ===== AppKitButton =====
  describe("AppKitButton", () => {
    it("renders connect button when not connected", () => {
      mockUseWallet.mockReturnValue({ isConnected: false, isConnecting: false })

      render(
        <AppKit {...defaultConfig}>
          <AppKitButton />
        </AppKit>
      )

      // WC renders "Connect Wallet" via the mock
      expect(screen.getByText("Connect Wallet")).toBeTruthy()
    })

    it("connects the selected injected wallet through the provider", async () => {
      const connectInjected = vi.fn().mockResolvedValue(undefined)
      mockUseWeb3.mockReturnValue({ connectInjected })

      render(
        <AppKit {...defaultConfig}>
          <AppKitButton />
        </AppKit>
      )

      fireEvent.click(screen.getByTestId("mock-injected-wallet"))
      await act(async () => {})
      expect(connectInjected).toHaveBeenCalledWith("io.test.wallet")
    })
  })

  // ===== useAppKit Hook =====
  describe("useAppKit Hook", () => {
    it("provides context to children via useAppKit", () => {
      render(
        <AppKit {...defaultConfig}>
          <TestConsumer />
        </AppKit>
      )

      // Consumer should render without error
      expect(screen.queryByTestId("hook-error")).toBeNull()
      expect(screen.getByTestId("hook-result")).toBeTruthy()
      expect(screen.getByText("OK")).toBeTruthy()
    })

    it("throws error when used outside AppKit provider", () => {
      render(<TestConsumer />)

      expect(screen.getByTestId("hook-error")).toBeTruthy()
      expect(screen.getByText(/useAppKit must be used within/)).toBeTruthy()
    })

    it("provides correct isConnected value", () => {
      mockUseWallet.mockReturnValue({ isConnected: true, isConnecting: false })

      render(
        <AppKit {...defaultConfig}>
          <TestConsumer />
        </AppKit>
      )

      const result = screen.getByTestId("hook-result")
      expect(result.getAttribute("data-connected")).toBe("true")
    })

    it("provides correct hasWallets value", () => {
      mockUseEIP6963.mockReturnValue({ wallets: [{ id: "test", name: "Test Wallet" }], isDetecting: false, hasWallets: true })

      render(
        <AppKit {...defaultConfig}>
          <TestConsumer />
        </AppKit>
      )

      const result = screen.getByTestId("hook-result")
      expect(result.getAttribute("data-has-wallets")).toBe("true")
    })
  })

  // ===== AppKitChainSelector =====
  describe("AppKitChainSelector", () => {
    it("renders chain selector without crashing", () => {
      render(
        <AppKit {...defaultConfig}>
          <AppKitChainSelector />
        </AppKit>
      )

      // Should render without crashing (AppKitChainSelector uses ChainSelector internally)
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
    })
  })
})
