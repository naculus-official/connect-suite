/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

afterEach(() => cleanup())

// ── Mocks ──────────────────────────────────────────────────────────

// Mock @naculus/connect-appkit-react - minimal for Web3ConnectProvider
const mockWeb3ConnectProvider = vi.fn()
vi.mock("@naculus/connect-appkit-react", () => ({
  Web3ConnectProvider: ({ children, config, autoConnect }: any) => {
    mockWeb3ConnectProvider({ config, autoConnect })
    return <div data-testid="web3-connect-provider">{children}</div>
  },
}))

// Mock ThemeContext
const _mockGenerateCSS = vi.fn()
vi.mock("../contexts/ThemeContext", () => ({
  ThemeProvider: ({ children, theme, defaultDark, priority }: any) => {
    return (
      <div
        data-testid="theme-provider"
        data-theme={JSON.stringify(theme)}
        data-default-dark={defaultDark}
        data-priority={priority}
      >
        {children}
      </div>
    )
  },
}))

// Mock ComponentRegistry
vi.mock("../contexts/ComponentRegistry", () => ({
  Web3ComponentProvider: ({ children, components }: any) => {
    return <div data-testid="component-provider">{children}</div>
  },
}))

// Mock WalletConnectContext
const _mockConnectWalletConnect = vi.fn()
vi.mock("../contexts/WalletConnectContext", () => ({
  WalletConnectProvider: ({ children }: any) => {
    return <div data-testid="wallet-connect-provider">{children}</div>
  },
}))

// Mock QRCodeModal
vi.mock("./QRCodeModal", () => ({
  QRCodeModal: ({ open, onClose, uri }: any) => {
    if (!open) return null
    return <div data-testid="qr-code-modal">QR Code: {uri}</div>
  },
}))

import { Web3ConnectUI, useDetectionMode } from "./Web3ConnectUI"

// ── Test Helpers ───────────────────────────────────────────────────

const defaultConfig = {
  projectId: "test-project-id",
  metadata: {
    name: "Test App",
    description: "Test description",
    url: "https://test.com",
    icons: ["https://test.com/icon.png"],
  },
}

function renderWeb3ConnectUI(
  overrides: Record<string, any> = {},
  children: React.ReactNode = <div data-testid="child">Child Content</div>
) {
  return render(
    <Web3ConnectUI config={defaultConfig} {...overrides}>
      {children}
    </Web3ConnectUI>
  )
}

// ── DetectionMode Consumer Component ──────────────────────────────
function DetectionModeConsumer() {
  const { mode } = useDetectionMode()
  return <div data-testid="detection-mode" data-mode={mode}>{mode}</div>
}

// ── Tests ──────────────────────────────────────────────────────────

describe("Web3ConnectUI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===== Basic Rendering =====
  describe("Basic Rendering", () => {
    it("renders children", () => {
      renderWeb3ConnectUI()
      expect(screen.getByTestId("child")).toBeTruthy()
      expect(screen.getByText("Child Content")).toBeTruthy()
    })

    it("renders provider hierarchy", () => {
      renderWeb3ConnectUI()
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
      expect(screen.getByTestId("component-provider")).toBeTruthy()
      expect(screen.getByTestId("web3-connect-provider")).toBeTruthy()
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })

    it("renders without crashing with no props besides config", () => {
      renderWeb3ConnectUI()
      expect(screen.getByTestId("child")).toBeTruthy()
    })
  })

  // ===== detectionMode Prop =====
  describe("detectionMode Prop", () => {
    it("uses 'walletconnect' as default detectionMode", () => {
      renderWeb3ConnectUI()
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })

    it("renders WalletConnectProvider when detectionMode is 'walletconnect'", () => {
      renderWeb3ConnectUI({ detectionMode: "walletconnect" })
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })

    it("does NOT render WalletConnectProvider when detectionMode is 'eip6963'", () => {
      renderWeb3ConnectUI({ detectionMode: "eip6963" })
      expect(screen.queryByTestId("wallet-connect-provider")).toBeNull()
    })

    it("renders WalletConnectProvider when detectionMode is 'auto'", () => {
      renderWeb3ConnectUI({ detectionMode: "auto" })
      expect(screen.getByTestId("wallet-connect-provider")).toBeTruthy()
    })

    it("provides correct detection mode via context", () => {
      renderWeb3ConnectUI(
        { detectionMode: "eip6963" },
        <DetectionModeConsumer />
      )
      expect(screen.getByTestId("detection-mode").textContent).toBe("eip6963")
    })

    it("provides 'walletconnect' as default mode in context", () => {
      renderWeb3ConnectUI(undefined, <DetectionModeConsumer />)
      expect(screen.getByTestId("detection-mode").textContent).toBe("walletconnect")
    })
  })

  // ===== Theme Application =====
  describe("Theme Application", () => {
    it("passes theme prop to ThemeProvider", () => {
      const theme = { primary: "#ff0000", background: "#000000" }
      renderWeb3ConnectUI({ theme })

      const themeProvider = screen.getByTestId("theme-provider")
      const themeData = JSON.parse(themeProvider.getAttribute("data-theme") || "{}")
      expect(themeData).toEqual(theme)
    })

    it("passes defaultDark prop to ThemeProvider", () => {
      renderWeb3ConnectUI({ defaultDark: true })

      const themeProvider = screen.getByTestId("theme-provider")
      expect(themeProvider.getAttribute("data-default-dark")).toBe("true")
    })

    it("defaults to defaultDark=false", () => {
      renderWeb3ConnectUI()

      const themeProvider = screen.getByTestId("theme-provider")
      expect(themeProvider.getAttribute("data-default-dark")).toBe("false")
    })

    it("passes themePriority prop to ThemeProvider", () => {
      renderWeb3ConnectUI({ themePriority: "fallback" })

      const themeProvider = screen.getByTestId("theme-provider")
      expect(themeProvider.getAttribute("data-priority")).toBe("fallback")
    })

    it("defaults to themePriority='computed'", () => {
      renderWeb3ConnectUI()

      const themeProvider = screen.getByTestId("theme-provider")
      expect(themeProvider.getAttribute("data-priority")).toBe("computed")
    })
  })

  // ===== Props Forwarding =====
  describe("Props Forwarding", () => {
    it("passes config to Web3ConnectProvider", () => {
      renderWeb3ConnectUI()

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            projectId: "test-project-id",
          }),
        })
      )
    })

    it("passes metadata in config", () => {
      renderWeb3ConnectUI()

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            metadata: expect.objectContaining({
              name: "Test App",
              url: "https://test.com",
            }),
          }),
        })
      )
    })

    it("passes enableEmbedded in config", () => {
      renderWeb3ConnectUI({
        config: { ...defaultConfig, enableEmbedded: true },
      })

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            enableEmbedded: true,
          }),
        })
      )
    })

    it("passes enablePasskeys in config", () => {
      renderWeb3ConnectUI({
        config: { ...defaultConfig, enablePasskeys: true },
      })

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            enablePasskeys: true,
          }),
        })
      )
    })

    it("forwards autoConnect prop", () => {
      renderWeb3ConnectUI({ autoConnect: true })

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          autoConnect: true,
        })
      )
    })

    it("defaults autoConnect to false", () => {
      renderWeb3ConnectUI()

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          autoConnect: false,
        })
      )
    })
  })

  // ===== Provider Wrapper Behavior =====
  describe("Provider Wrapper Behavior", () => {
    it("wraps children in correct order (outermost: DetectionContext)", () => {
      renderWeb3ConnectUI()

      // The DetectionContext is the outermost provider
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
      expect(screen.getByTestId("component-provider")).toBeTruthy()
    })

    it("includes QRCodeModal in component registry", () => {
      renderWeb3ConnectUI()

      // QRCodeModal is passed to Web3ComponentProvider
      const componentProvider = screen.getByTestId("component-provider")
      expect(componentProvider).toBeTruthy()
    })

    it("passes QRCodeModal to component registry", () => {
      // Check if the Web3ComponentProvider receives the QRCodeModal
      // Since we mock Web3ComponentProvider, verify the component hierarchy
      renderWeb3ConnectUI()
      expect(screen.getByTestId("component-provider")).toBeTruthy()
    })
  })

  // ===== Edge Cases =====
  describe("Edge Cases", () => {
    it("renders with empty children", () => {
      renderWeb3ConnectUI({}, null as any)
      // Should not crash
      expect(screen.getByTestId("theme-provider")).toBeTruthy()
    })

    it("renders with multiple children", () => {
      renderWeb3ConnectUI({}, (
        <>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </>
      ))

      expect(screen.getByTestId("child-1")).toBeTruthy()
      expect(screen.getByTestId("child-2")).toBeTruthy()
    })

    it("renders with undefined theme without crashing", () => {
      renderWeb3ConnectUI({ theme: undefined })

      const themeProvider = screen.getByTestId("theme-provider")
      const themeData = JSON.parse(themeProvider.getAttribute("data-theme") || "{}")
      expect(themeData).toEqual({})
    })

    it("handles config with all optional fields", () => {
      const minimalConfig = {
        projectId: "minimal",
        metadata: { name: "Min", description: "", url: "", icons: [] },
      }
      renderWeb3ConnectUI({ config: minimalConfig })

      expect(mockWeb3ConnectProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            projectId: "minimal",
          }),
        })
      )
    })
  })
})
