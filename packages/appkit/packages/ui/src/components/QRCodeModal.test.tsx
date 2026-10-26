/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QRCodeModal } from "./QRCodeModal";

afterEach(() => cleanup());

// Mock the browser entry used by the production renderer.
vi.mock("qrcode/lib/browser.js", () => ({
  default: {
    toCanvas: vi.fn((_canvas: HTMLCanvasElement, _uri: string, _opts: unknown, cb: (err: Error | null) => void) => {
      cb(null);
    }),
  },
  toCanvas: vi.fn((_canvas: HTMLCanvasElement, _uri: string, _opts: unknown, cb: (err: Error | null) => void) => {
    cb(null);
  }),
}));

// Mock useIsMobile hook
const mockUseIsMobile = vi.fn().mockReturnValue(false);
vi.mock("../hooks/useIsMobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  QrCode: ({ size, style }: { size?: number; style?: Record<string, string> }) => (
    <div data-testid="qr-icon" style={style}>QR</div>
  ),
  Smartphone: ({ size }: { size?: number }) => <div data-testid="smartphone-icon">SP</div>,
  X: ({ size }: { size?: number }) => <div data-testid="x-icon">X</div>,
  RefreshCw: ({ size }: { size?: number }) => <div data-testid="refresh-icon">RF</div>,
  CheckCircle2: ({ size, style }: { size?: number; style?: Record<string, string> }) => (
    <div data-testid="check-icon" style={style}>CK</div>
  ),
  AlertCircle: ({ size, style }: { size?: number; style?: Record<string, string> }) => (
    <div data-testid="alert-icon" style={style}>AL</div>
  ),
  Loader2: ({ size, style }: { size?: number; style?: Record<string, string> }) => (
    <div data-testid="loader-icon" style={style}>LD</div>
  ),
}));

describe("QRCodeModal", () => {
  const defaultProps = {
    uri: "wc:test-uri-123",
    open: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
  });

  it("renders nothing when open is false", () => {
    const { container } = render(<QRCodeModal {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders QR code section and title when open", () => {
    render(<QRCodeModal {...defaultProps} />);
    // Title appears in the visible h3
    const titles = screen.getAllByText("Scan with WalletConnect");
    expect(titles.length).toBe(1);
    expect(screen.getByText("Open your wallet app and scan this QR code to connect.")).toBeDefined();
  });

  it("renders a canvas element for QR", () => {
    const { container } = render(<QRCodeModal {...defaultProps} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBe(280);
    expect(canvas!.height).toBe(280);
  });

  it("calls onClose when close button is clicked", () => {
    render(<QRCodeModal {...defaultProps} />);
    const closeBtns = screen.getAllByRole("button");
    const xBtn = closeBtns.find(b => b.getAttribute("aria-label") === "Close modal");
    expect(xBtn).toBeDefined();
    fireEvent.click(xBtn!);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay is clicked", () => {
    const { container } = render(<QRCodeModal {...defaultProps} />);
    const overlay = container.firstChild?.firstChild as HTMLElement;
    expect(overlay).toBeDefined();
    fireEvent.click(overlay);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    render(<QRCodeModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not call onClose on Escape when modal is closed", () => {
    render(<QRCodeModal {...defaultProps} open={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("has proper ARIA attributes for dialog role", () => {
    render(<QRCodeModal {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Scan with WalletConnect");
  });

  it("shows expired state when timeElapsed >= timeoutMs", async () => {
    vi.useFakeTimers();
    render(<QRCodeModal {...defaultProps} timeoutMs={10000} />);
    await vi.advanceTimersByTimeAsync(11000);
    expect(screen.getByTestId("x-icon")).toBeDefined();
    vi.useRealTimers();
  });

  it("shows retry button when expired and onRetry provided", () => {
    const onRetry = vi.fn();
    render(<QRCodeModal {...defaultProps} status="expired" onRetry={onRetry} />);
    const retryBtn = screen.getByText("Generate New QR Code");
    expect(retryBtn).toBeDefined();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows scanned status", () => {
    render(<QRCodeModal {...defaultProps} status="scanned" />);
    expect(screen.getByText("QR code scanned! Connecting...")).toBeDefined();
  });

  it("shows error status", () => {
    render(<QRCodeModal {...defaultProps} status="error" />);
    expect(screen.getByText(/Something went wrong/i)).toBeDefined();
  });

  it("shows expired status from prop", () => {
    render(<QRCodeModal {...defaultProps} status="expired" />);
    expect(screen.getByText("Connection timed out.")).toBeDefined();
  });

  it("shows deep link button when showDeepLink is true", () => {
    render(<QRCodeModal {...defaultProps} showDeepLink={true} />);
    expect(screen.getByText("Open in Wallet App")).toBeDefined();
  });

  it("shows deep link button automatically when on mobile (useIsMobile returns true)", () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<QRCodeModal {...defaultProps} />);
    expect(screen.getByText("Open in Wallet App")).toBeDefined();
  });

  it("calls onDeepLink when deep link button is clicked", () => {
    const onDeepLink = vi.fn();
    render(<QRCodeModal {...defaultProps} showDeepLink={true} onDeepLink={onDeepLink} />);
    fireEvent.click(screen.getByText("Open in Wallet App"));
    expect(onDeepLink).toHaveBeenCalledWith("wc:test-uri-123");
  });

  it("renders with custom title and description", () => {
    render(
      <QRCodeModal
        {...defaultProps}
        title="Custom Title"
        description="Custom description text"
      />
    );
    // Title appears in the visible h3
    const titles = screen.getAllByText("Custom Title");
    expect(titles.length).toBe(1);
    expect(screen.getByText("Custom description text")).toBeDefined();
  });

  it("shows Cancel button", () => {
    render(<QRCodeModal {...defaultProps} />);
    expect(screen.getByText("Cancel")).toBeDefined();
  });

  it("calls onClose when Cancel is clicked", () => {
    render(<QRCodeModal {...defaultProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not show expired progress bar when status is scanned", () => {
    render(<QRCodeModal {...defaultProps} status="scanned" />);
    expect(screen.queryByText(/Expires in/i)).toBeNull();
  });

  it("shows countdown timer", () => {
    render(<QRCodeModal {...defaultProps} timeoutMs={120000} />);
    expect(screen.getByText(/Expires in 2:00/)).toBeDefined();
  });

  it("does not render canvas when uri is null", () => {
    const { container } = render(<QRCodeModal {...defaultProps} uri={null} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeNull();
  });

  it("locks body scroll when open", () => {
    expect(document.body.style.overflow).toBe("");
    const { unmount } = render(<QRCodeModal {...defaultProps} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows loader icon in pending state", () => {
    render(<QRCodeModal {...defaultProps} />);
    expect(screen.getByTestId("loader-icon")).toBeDefined();
  });

  it("has proper aria-label on close button", () => {
    render(<QRCodeModal {...defaultProps} />);
    const xBtn = screen.getByLabelText("Close modal");
    expect(xBtn).toBeDefined();
  });

  it("does not show deep link button when showDeepLink is false", () => {
    render(<QRCodeModal {...defaultProps} showDeepLink={false} />);
    expect(screen.queryByText("Open in Wallet App")).toBeNull();
  });
});
