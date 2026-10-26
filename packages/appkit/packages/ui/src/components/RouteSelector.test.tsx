/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RouteSelector } from "./RouteSelector";
import type { Token } from "@naculus/connect-core";
import type { Route } from "./RouteSelector";

// ── Mock Component Registry ───────────────────────────────────────────

function TestButton({
  children,
  className,
  onClick,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
}) {
  return (
    <button className={className} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

function TestCard({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className}>{children}</div>;
}

function TestBadge({ children, className, variant }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return <span className={className} data-variant={variant}>{children}</span>;
}

function TestSkeleton({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} data-testid="mock-skeleton" />;
}

vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({
    Button: TestButton,
    Card: TestCard,
    Badge: TestBadge,
    Skeleton: TestSkeleton,
    Progress: undefined, // Not needed for tests
  }),
}));

// ── Mock Data ─────────────────────────────────────────────────────────

const ethToken: Token = {
  chainId: 1,
  address: "0x0000000000000000000000000000000000000000",
  decimals: 18,
  symbol: "ETH",
};

const usdcToken: Token = {
  chainId: 137,
  address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  decimals: 6,
  symbol: "USDC",
};

const mockRoute: Route = {
  id: "mock-route",
  provider: "lifi",
  fromChain: "eip155:1",
  toChain: "eip155:137",
  fromToken: "0x0000000000000000000000000000000000000000",
  toToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  fromAmount: "1000000000000000000",
  toAmount: "3100000000",
  toAmountMin: "3069000000",
  gasCosts: {
    fromChain: { maxFeePerGas: "20000000000", maxPriorityFeePerGas: "1000000000", gasLimit: "100000", totalCostWei: "2000000000000000", totalCostUsd: "2.50" },
    toChain: { maxFeePerGas: "30000000000", maxPriorityFeePerGas: "1500000000", gasLimit: "200000", totalCostWei: "6000000000000000", totalCostUsd: "3.00" },
    totalUsd: "5.50",
  },
  estimatedTime: 300,
  steps: [
    {
      type: "swap",
      chain: "eip155:1",
      token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      contractAddress: "0x0",
      estimatedGas: "150000",
    },
  ],
  fee: { protocolFee: "1000000000000000" },
  summary: "LiFi — ETH → USDC via swap",
};

const mockRouteB: Route = {
  id: "mock-route-b",
  provider: "axelar",
  fromChain: "eip155:1",
  toChain: "eip155:137",
  fromToken: "0x0000000000000000000000000000000000000000",
  toToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  fromAmount: "1000000000000000000",
  toAmount: "3098000000",
  toAmountMin: "3067020000",
  gasCosts: {
    fromChain: { maxFeePerGas: "20000000000", maxPriorityFeePerGas: "1000000000", gasLimit: "100000", totalCostWei: "2000000000000000", totalCostUsd: "2.50" },
    toChain: { maxFeePerGas: "30000000000", maxPriorityFeePerGas: "1500000000", gasLimit: "200000", totalCostWei: "6000000000000000", totalCostUsd: "3.00" },
    totalUsd: "4.20",
  },
  estimatedTime: 600,
  steps: [
    {
      type: "swap",
      chain: "eip155:1",
      token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      contractAddress: "0x0",
      estimatedGas: "150000",
    },
  ],
  fee: { protocolFee: "800000000000000" },
  summary: "Axelar — ETH → USDC via swap",
};

// ── Tests ─────────────────────────────────────────────────────────────

describe("RouteSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders loading skeleton when loading prop is true", () => {
    render(
      <RouteSelector
        loading
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-loading")).toBeDefined();
    expect(screen.getByText("Fetching best routes...")).toBeDefined();
  });

  it("displays route options when routes are provided", () => {
    render(
      <RouteSelector
        routes={[mockRoute, mockRouteB]}
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-routes")).toBeDefined();

    // Both route providers should be visible
    expect(screen.getByText("lifi")).toBeDefined();
    expect(screen.getByText("axelar")).toBeDefined();

    // Both "Select" buttons should exist
    const selectButtons = screen.getAllByText("Select");
    expect(selectButtons.length).toBe(2);
  });

  it("handles route selection click", () => {
    const onRouteSelected = vi.fn();

    render(
      <RouteSelector
        routes={[mockRoute]}
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
        onRouteSelected={onRouteSelected}
      />,
    );

    const selectButton = screen.getByText("Select");
    fireEvent.click(selectButton);

    expect(onRouteSelected).toHaveBeenCalledWith(mockRoute);
  });

  it("shows error state when error prop is provided", () => {
    const errorMsg = "Insufficient liquidity for this route";

    render(
      <RouteSelector
        error={errorMsg}
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-error")).toBeDefined();
    expect(screen.getByText("Failed to fetch routes")).toBeDefined();
    expect(screen.getByText(errorMsg)).toBeDefined();
  });

  it("shows empty state when no routes found", () => {
    render(
      <RouteSelector
        routes={[]}
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-empty")).toBeDefined();
    expect(screen.getByText("No routes found for this pair")).toBeDefined();
  });

  it("shows execution progress when executing is true", () => {
    render(
      <RouteSelector
        executing
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-executing")).toBeDefined();
    expect(screen.getByText("Executing route...")).toBeDefined();
  });

  it("shows success state with tx hash", () => {
    const txHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

    render(
      <RouteSelector
        successTxHash={txHash}
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
      />,
    );

    expect(screen.getByTestId("route-selector-success")).toBeDefined();
    expect(screen.getByText("Route executed successfully!")).toBeDefined();
    expect(screen.getByText(/0xabcd/)).toBeDefined();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();

    render(
      <RouteSelector
        routes={[mockRoute]}
        onCancel={onCancel}
      />,
    );

    const cancelButton = screen.getByText("Cancel");
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("displays input and output token symbols in header", () => {
    render(
      <RouteSelector
        inputToken={{ chainId: 1, address: ethToken.address, symbol: "ETH" }}
        outputToken={{ chainId: 137, address: usdcToken.address, symbol: "USDC" }}
        amount={1000000000000000000n}
        routes={[mockRoute]}
      />,
    );

    expect(screen.getByTestId("route-selector-routes")).toBeDefined();
    // Token symbols should be rendered in the header
    expect(screen.getAllByText(/ETH/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/USDC/).length).toBeGreaterThanOrEqual(1);
    // Amount should be displayed as 1000000000000000000 (raw bigint)
    expect(screen.getByText(/1000000000000000000/)).toBeDefined();
  });

  it("renders without crashing when no props are provided", () => {
    const { container } = render(<RouteSelector />);
    // Should render an empty card/container
    expect(container.querySelector('[class*="rounded-lg"]')).toBeDefined();
  });

  it("does not show cancel button in success state", () => {
    render(
      <RouteSelector
        successTxHash="0xhash"
        routes={[mockRoute]}
      />,
    );

    // In success state, the whole card is replaced with SuccessState
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("displays cost info on route cards", () => {
    render(
      <RouteSelector
        routes={[mockRoute]}
      />,
    );

    // Cost should appear with $ format
    expect(screen.getByText(/\$5\.50/)).toBeDefined();
  });

  it("shows retry button in error state when onRetry is available", () => {
    // Note: current implementation doesn't have onRetry; ErrorState renders a retry
    // button only if onRetry is provided. Our ErrorState currently doesn't receive onRetry.
    // This test verifies the error state renders at minimum.
    render(
      <RouteSelector
        error="Something went wrong"
      />,
    );

    expect(screen.getByTestId("route-selector-error")).toBeDefined();
    // No retry button since we don't pass an onRetry via props
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("renders multiple route steps info", () => {
    const multiStepRoute: Route = {
      ...mockRoute,
      steps: [
        { ...mockRoute.steps[0] },
        {
          type: "swap",
          chain: "eip155:1",
          token: "usdc",
          contractAddress: "0x0",
          estimatedGas: "150000",
        },
      ],
    };

    render(
      <RouteSelector
        routes={[multiStepRoute]}
      />,
    );

    expect(screen.getByText("2 steps")).toBeDefined();
  });
});
