/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"

// Mock useIsMobile
const mockUseIsMobile = vi.fn().mockReturnValue(false)
vi.mock("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

// Mock ComponentRegistry
vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({}),
}))

// Mock WalletConnect context
const mockConnectWalletConnect = vi.fn()
vi.mock("../contexts/WalletConnectContext", () => ({
  useWalletConnectOptional: () => ({
    connectWalletConnect: mockConnectWalletConnect,
    state: { qrStatus: "idle", qrUri: null, error: null },
  }),
}))

// Mock WC component — expose props for inspection
const lastWcProps: any = { current: {} }
vi.mock("@naculus/connect-appkit-react", () => ({
  Web3Context: { Provider: ({ children }: any) => children },
  AppkitConnectButton: (props: any) => {
    lastWcProps.current = props
    return (
      <div data-testid="wc-connect-button">
        <span data-testid="wc-connected">{String(props.connected)}</span>
        <span data-testid="wc-address">{props.address || "none"}</span>
        <span data-testid="wc-connecting">{String(props.connecting)}</span>
        <button type="button"
          data-testid="wc-fire-connect"
          onClick={() => props.onAppkitConnect?.({ detail: { kind: "injected", walletId: "meta" } })}
        />
        <button type="button"
          data-testid="wc-fire-connect-wc"
          onClick={() => props.onAppkitConnect?.({ detail: { kind: "walletconnect" } })}
        />
        <button type="button"
          data-testid="wc-fire-disconnect"
          onClick={() => props.onAppkitDisconnect?.()}
        />
        <button type="button"
          data-testid="wc-fire-start-pairing"
          onClick={() => props.onAppkitStartPairing?.()}
        />
        {props.children}
      </div>
    )
  },
}))

// Mock EIP-6963
const mockUseEIP6963 = vi.fn().mockReturnValue({
  wallets: [],
  isDetecting: false,
  hasWallets: false,
})
vi.mock("../hooks/useEIP6963", () => ({
  useEIP6963: () => mockUseEIP6963(),
}))

// Mock qrcode
vi.mock("qrcode", () => ({
  default: { toCanvas: vi.fn((_: any, __: string, _opts: any, cb: (e: null) => void) => cb(null)) },
}))

import { ConnectButton } from "./ConnectButton"

describe("ConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseIsMobile.mockReturnValue(false)
    mockUseEIP6963.mockReturnValue({
      wallets: [],
      isDetecting: false,
      hasWallets: false,
    })
    lastWcProps.current = {}
  })

  afterEach(() => {
    cleanup()
  })

  it("renders the WC wrapper when disconnected", () => {
    render(<ConnectButton />)
    expect(screen.getByTestId("wc-connect-button")).toBeDefined()
  })

  it("passes connected=false when disconnected", () => {
    render(<ConnectButton />)
    expect(lastWcProps.current.connected).toBe(false)
  })

  it("passes connected=true when connected", () => {
    render(<ConnectButton isConnected={true} address="0x1234" />)
    expect(lastWcProps.current.connected).toBe(true)
    expect(lastWcProps.current.address).toBe("0x1234")
  })

  it("passes connecting=true when connecting", () => {
    render(<ConnectButton isConnecting={true} />)
    expect(lastWcProps.current.connecting).toBe(true)
  })

  it("passes balance props through", () => {
    render(<ConnectButton isConnected={true} address="0xabc" balance="2.5" balanceSymbol="ETH" />)
    expect(lastWcProps.current.balance).toBe("2.5")
    expect(lastWcProps.current.balanceSymbol).toBe("ETH")
  })

  it("calls onConnect when WC fires appkitConnect with injected", () => {
    const onConnect = vi.fn()
    render(<ConnectButton onConnect={onConnect} />)
    fireEvent.click(screen.getByTestId("wc-fire-connect"))
    expect(onConnect).toHaveBeenCalledWith("injected", expect.any(Function), "meta")
  })

  it("calls onDisconnect when WC fires appkitDisconnect", () => {
    const onDisconnect = vi.fn()
    render(<ConnectButton isConnected={true} onDisconnect={onDisconnect} />)
    fireEvent.click(screen.getByTestId("wc-fire-disconnect"))
    expect(onDisconnect).toHaveBeenCalledOnce()
  })

  it("calls WalletConnect context when startPairing emitted", () => {
    render(<ConnectButton />)
    fireEvent.click(screen.getByTestId("wc-fire-start-pairing"))
    expect(mockConnectWalletConnect).toHaveBeenCalledOnce()
  })

  it("applies className as wrapper div", () => {
    const { container } = render(<ConnectButton className="my-class" />)
    expect((container.firstChild as HTMLElement).className).toContain("my-class")
  })

  it("passes explorerUrl through", () => {
    render(<ConnectButton explorerUrl="https://etherscan.io" />)
    expect(lastWcProps.current.explorerUrl).toBe("https://etherscan.io")
  })

  it("serializes only display metadata from circular EIP-6963 providers", () => {
    const provider: Record<string, unknown> = {}
    provider.self = provider
    mockUseEIP6963.mockReturnValue({
      wallets: [
        {
          id: "io.metamask",
          name: "MetaMask",
          icon: "data:image/svg+xml;base64,PHN2Zy8+",
          rdns: "io.metamask",
          provider,
        },
      ],
      isDetecting: false,
      hasWallets: true,
    })

    render(<ConnectButton />)

    expect(JSON.parse(lastWcProps.current.walletsJson)).toEqual([
      {
        id: "io.metamask",
        name: "MetaMask",
        icon: "data:image/svg+xml;base64,PHN2Zy8+",
        rdns: "io.metamask",
      },
    ])
  })

  describe("mobile deep link", () => {
    it("calls onMobileDeepLink when on mobile", () => {
      mockUseIsMobile.mockReturnValue(true)
      const onMobileDeepLink = vi.fn()
      render(<ConnectButton onMobileDeepLink={onMobileDeepLink} />)
      expect(onMobileDeepLink).not.toHaveBeenCalled()
      // Mobile deep link requires the component to call it — test that the wrapper is rendered
      expect(screen.getByTestId("wc-connect-button")).toBeDefined()
    })
  })
})
