/// <reference types="vitest" />
/// @vitest-environment jsdom

import type React from "react"
import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

afterEach(() => cleanup())
import {
  Web3ComponentProvider,
  useComponentRegistry,
  useComponent,
  DEFAULT_COMPONENTS,
} from "./ComponentRegistry"

function TestConsumer() {
  const registry = useComponentRegistry()
  const allKeys = Object.keys(DEFAULT_COMPONENTS)

  return (
    <div data-testid="registry">
      <div data-testid="registry-size">{Object.keys(registry).length}</div>
      <div data-testid="total-default-keys">{allKeys.length}</div>
      <div data-testid="all-keys-present">
        {allKeys.every((k) => Boolean(registry[k as keyof typeof registry]))
          ? "true"
          : "false"}
      </div>
    </div>
  )
}

function CustomButton({ children }: { children: React.ReactNode }) {
  return <button type="button" data-testid="custom-button">{children}</button>
}

function CustomDialog({ children }: { children: React.ReactNode }) {
  return <div data-testid="custom-dialog">{children}</div>
}

function OverrideConsumer() {
  const _registry = useComponentRegistry()
  const Button = useComponent("Button")
  const Dialog = useComponent("Dialog")

  return (
    <div>
      <div data-testid="has-button">{String(Boolean(Button))}</div>
      <div data-testid="has-dialog">{String(Boolean(Dialog))}</div>
      <div data-testid="button-is-custom">
        {Button === CustomButton ? "true" : "false"}
      </div>
    </div>
  )
}

function ButtonRender() {
  const Button = useComponent("Button")
  if (!Button) return <div data-testid="no-button">No button</div>
  return <Button>Click me</Button>
}

function ConnectRender() {
  const ConnectButton = useComponent("ConnectButton")
  if (!ConnectButton) return <div data-testid="no-connect">No connect</div>
  return <div data-testid="has-default-connect">Default connect</div>
}

function PartialOverrideConsumer() {
  const registry = useComponentRegistry()

  return (
    <div>
      <div data-testid="override-button">
        {registry.Button === CustomButton ? "true" : "false"}
      </div>
      <div data-testid="default-connect">
        {registry.ConnectButton !== undefined ? "true" : "false"}
      </div>
    </div>
  )
}

function Layer2Consumer() {
  const ConnectButton = useComponent("ConnectButton")
  const AccountButton = useComponent("AccountButton")
  const ChainSelector = useComponent("ChainSelector")
  const QRCodeModal = useComponent("QRCodeModal")
  const ErrorBoundary = useComponent("ErrorBoundary")

  return (
    <div>
      <div data-testid="has-connect-button">{String(Boolean(ConnectButton))}</div>
      <div data-testid="has-account-button">{String(Boolean(AccountButton))}</div>
      <div data-testid="has-chain-selector">{String(Boolean(ChainSelector))}</div>
      <div data-testid="has-qr-modal">{String(Boolean(QRCodeModal))}</div>
      <div data-testid="has-error-boundary">{String(Boolean(ErrorBoundary))}</div>
    </div>
  )
}

describe("ComponentRegistry", () => {
  it("provides all default components from DEFAULT_COMPONENTS", () => {
    render(
      <Web3ComponentProvider>
        <TestConsumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("all-keys-present").textContent).toBe("true")
  })

  it("registry size matches DEFAULT_COMPONENTS key count", () => {
    render(
      <Web3ComponentProvider>
        <TestConsumer />
      </Web3ComponentProvider>
    )

    const allKeys = Object.keys(DEFAULT_COMPONENTS)
    const size = parseInt(screen.getByTestId("registry-size").textContent!, 10)
    expect(size).toBe(allKeys.length)
    expect(size).toBeGreaterThanOrEqual(8)
  })

  it("overrides defaults with custom components", () => {
    render(
      <Web3ComponentProvider
        components={{
          Button: CustomButton,
          Dialog: CustomDialog,
        }}
      >
        <OverrideConsumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("has-button").textContent).toBe("true")
    expect(screen.getByTestId("has-dialog").textContent).toBe("true")
    expect(screen.getByTestId("button-is-custom").textContent).toBe("true")
  })

  it("useComponent returns the correct component", () => {
    render(
      <Web3ComponentProvider components={{ Button: CustomButton }}>
        <ButtonRender />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("custom-button")).toBeDefined()
    expect(screen.getByText("Click me")).toBeDefined()
  })

  it("useComponent returns default for unregistered keys", () => {
    render(
      <Web3ComponentProvider components={{}}>
        <ConnectRender />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("has-default-connect")).toBeDefined()
  })

  it("returns stable reference when components don't change", () => {
    const { rerender } = render(
      <Web3ComponentProvider components={{ Button: CustomButton }}>
        <TestConsumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("all-keys-present").textContent).toBe("true")

    rerender(
      <Web3ComponentProvider components={{ Button: CustomButton }}>
        <TestConsumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("all-keys-present").textContent).toBe("true")
  })

  it("overrides only specified components", () => {
    render(
      <Web3ComponentProvider components={{ Button: CustomButton }}>
        <PartialOverrideConsumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("override-button").textContent).toBe("true")
    expect(screen.getByTestId("default-connect").textContent).toBe("true")
  })

  it("provides all Layer 2 business components from DEFAULT_COMPONENTS", () => {
    render(
      <Web3ComponentProvider>
        <Layer2Consumer />
      </Web3ComponentProvider>
    )

    expect(screen.getByTestId("has-connect-button").textContent).toBe("true")
    expect(screen.getByTestId("has-account-button").textContent).toBe("true")
    expect(screen.getByTestId("has-chain-selector").textContent).toBe("true")
    expect(screen.getByTestId("has-qr-modal").textContent).toBe("true")
    expect(screen.getByTestId("has-error-boundary").textContent).toBe("true")
  })
})
