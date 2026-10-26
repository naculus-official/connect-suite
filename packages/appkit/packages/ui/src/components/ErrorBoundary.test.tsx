/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type React from "react";

// Minimal button component for tests (replaces the removed DefaultButton fallback)
function TestButton({ children, className, onClick, disabled, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return <button className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
}

vi.mock("../contexts/ComponentRegistry", () => ({
  useComponentRegistry: () => ({ Button: TestButton }),
}))
import { ErrorBoundary } from "./ErrorBoundary";

// ── Helpers ───────────────────────────────────────────────────────

function GoodChild() {
  return <div data-testid="good-child">Everything is fine</div>;
}

const BadChild = ({ message = "Test error" }: { message?: string }) => {
  throw new Error(message);
};

const _SilentBadChild = ({ message = "Silent error" }: { message?: string }) => {
  throw new Error(message);
};

function _ConditionalChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Controlled error");
  }
  return <div data-testid="good-child">Recovered</div>;
}

// ── Tests ─────────────────────────────────────────────────────────

const controlled = { shouldThrow: true };

function ControlledChild() {
  if (controlled.shouldThrow) throw new Error("Controlled error");
  return <div data-testid="good-child">Recovered</div>;
}

function DeepError() {
  return (
    <div>
      <section>
        <article>
          <BadChild />
        </article>
      </section>
    </div>
  );
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Prevent console.error from polluting test output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
  });

  it("should render children when no error", () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("good-child")).toBeTruthy();
    expect(screen.getByText("Everything is fine")).toBeTruthy();
  });

  it("should catch errors and show default fallback UI", () => {
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Test error")).toBeTruthy();
    expect(screen.getByText("Try Again")).toBeTruthy();
  });

  it("should show custom fallback when provided", () => {
    const customFallback = vi.fn(({ error, reset }: { error: Error; reset: () => void }) => (
      <div data-testid="custom-fallback">
        <p>Custom: {error.message}</p>
        <button type="button" onClick={reset} data-testid="custom-reset">
          Reset
        </button>
      </div>
    ));

    render(
      <ErrorBoundary fallback={customFallback}>
        <BadChild message="Custom error message" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("custom-fallback")).toBeTruthy();
    expect(screen.getByText("Custom: Custom error message")).toBeTruthy();
    expect(customFallback).toHaveBeenCalled();
  });

  it("should reset after clicking retry button", async () => {
    // Use a controllable helper with ref-based state
    controlled.shouldThrow = true;

    render(
      <ErrorBoundary>
        <ControlledChild />
      </ErrorBoundary>
    );

    // Error caught
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Controlled error")).toBeTruthy();

    // Stop throwing, then retry
    controlled.shouldThrow = false;
    const retryButton = screen.getByText("Try Again");
    fireEvent.click(retryButton);

    // After reset, ControlledChild no longer throws
    expect(screen.getByTestId("good-child")).toBeTruthy();
  });

  it("should call onError when error is caught", () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <BadChild message="Log me" />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("Log me");
  });

  it("should call onReset when reset is triggered", () => {
    const onReset = vi.fn();

    render(
      <ErrorBoundary onReset={onReset}>
        <BadChild />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Try Again"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("should use custom retry label", () => {
    render(
      <ErrorBoundary retryLabel="Retry Connection">
        <BadChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Retry Connection")).toBeTruthy();
  });

  it("should catch deeply nested errors", () => {
    render(
      <ErrorBoundary>
        <DeepError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Test error")).toBeTruthy();
  });

  it("should not show dismiss button when onDismiss is not provided", () => {
    render(
      <ErrorBoundary>
        <BadChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.queryByText("Dismiss")).toBeNull();
  });

  it("should show dismiss button when onDismiss is provided", () => {
    render(
      <ErrorBoundary onDismiss={vi.fn()}>
        <BadChild />
      </ErrorBoundary>
    );

    expect(screen.getByText("Try Again")).toBeTruthy();
    expect(screen.getByText("Dismiss")).toBeTruthy();
  });

  it("should dismiss error UI and render children (dismiss is temporary; if child still throws, boundary re-catches)", () => {
    render(
      <ErrorBoundary onDismiss={vi.fn()}>
        <BadChild />
      </ErrorBoundary>
    );

    // Error caught — should see fallback
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    // Dismiss — since BadChild still throws on re-render,
    // getDerivedStateFromError resets dismissed and we see fallback again.
    // This is expected React ErrorBoundary behavior.
    fireEvent.click(screen.getByText("Dismiss"));

    // Error boundary re-catches the throwing child
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("should dismiss permanently when children stop throwing", () => {
    controlled.shouldThrow = true;

    render(
      <ErrorBoundary onDismiss={vi.fn()}>
        <ControlledChild />
      </ErrorBoundary>
    );

    // Error caught
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    // Stop throwing, then dismiss
    controlled.shouldThrow = false;
    fireEvent.click(screen.getByText("Dismiss"));

    // Children should be visible
    expect(screen.getByTestId("good-child")).toBeTruthy();
    expect(screen.getByText("Recovered")).toBeTruthy();
  });

  it("should call onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();

    render(
      <ErrorBoundary onDismiss={onDismiss}>
        <BadChild />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should not call onDismiss on retry", () => {
    const onDismiss = vi.fn();

    render(
      <ErrorBoundary onDismiss={onDismiss}>
        <BadChild />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText("Try Again"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("should maintain children after successful recovery", () => {
    interface ErrorToggleProps {
      children: React.ReactNode;
    }

    const ErrorToggle = vi.fn(({ children }: ErrorToggleProps) => {
      return <div data-testid="error-toggle">{children}</div>;
    });

    const { rerender } = render(
      <ErrorBoundary>
        <ErrorToggle>
          <GoodChild />
        </ErrorToggle>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("good-child")).toBeTruthy();

    // Re-render should pass through fine
    rerender(
      <ErrorBoundary>
        <ErrorToggle>
          <GoodChild />
        </ErrorToggle>
      </ErrorBoundary>
    );

    expect(screen.getByTestId("good-child")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});
