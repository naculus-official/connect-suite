"use client"

import React from "react";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { NativeButton, type RegistryButton } from "../lib/registry-fallbacks";
import { DefaultDialog, DefaultDialogHeader, DefaultDialogContent } from "../lib/ui-defaults";

// ── Types ─────────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional custom fallback UI. Receives error and reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => React.ReactNode;
  /** Called when an error is caught. Useful for logging. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Called after the boundary resets. */
  onReset?: () => void;
  /** Called when the user dismisses the error dialog. */
  onDismiss?: () => void;
  /** Label for the retry button. Default: "Try Again" */
  retryLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  dismissed: boolean;
}

// ── Default Fallback UI ───────────────────────────────────────────

function DefaultErrorFallback({
  error,
  reset,
  dismiss,
  retryLabel = "Try Again",
}: {
  error: Error;
  reset: () => void;
  dismiss?: () => void;
  retryLabel?: string;
}) {
  const registry = useComponentRegistry();
  const Button = (registry.Button as RegistryButton | undefined) ?? NativeButton;
  const Dialog = registry.Dialog as React.ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }> | undefined;
  const DialogContent = registry.DialogContent as React.ComponentType<{ className?: string; children: React.ReactNode }> | undefined;
  const DialogHeader = registry.DialogHeader as React.ComponentType<{ children: React.ReactNode }> | undefined;
  const DialogTitle = registry.DialogTitle as React.ComponentType<{ children: React.ReactNode }> | undefined;

  if (Dialog && DialogContent) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent className="naculus-dialog-surface flex w-full max-w-lg flex-col overflow-y-auto">
          {DialogHeader && DialogTitle ? (
            <>
              <DialogHeader><DialogTitle>Something went wrong</DialogTitle></DialogHeader>
              <div style={{ marginTop: "0.5rem" }}>
                <p
                  style={{
                    color: "var(--muted-foreground, #666)",
                    fontSize: "0.875rem",
                    lineHeight: "1.5",
                    margin: 0,
                  }}
                >
                  {error.message || "An unexpected error occurred while connecting your wallet."}
                </p>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {dismiss && (
                    <Button
                      variant="outline"
                      size="default"
                      onClick={dismiss}
                    >
                      Dismiss
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="default"
                    onClick={reset}
                  >
                    {retryLabel}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: "1.125rem", marginBottom: "0.75rem" }}>
                Something went wrong
              </div>
              <p
                style={{
                  color: "var(--muted-foreground, #666)",
                  fontSize: "0.875rem",
                  lineHeight: "1.5",
                  margin: 0,
                }}
              >
                {error.message || "An unexpected error occurred while connecting your wallet."}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                {dismiss && (
                  <Button
                    variant="outline"
                    size="default"
                    onClick={dismiss}
                  >
                    Dismiss
                  </Button>
                )}
                <Button
                  variant="default"
                  size="default"
                  onClick={reset}
                >
                  {retryLabel}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Fallback: use DefaultDialog
  const isOpen = true;
  const onClose = dismiss ?? undefined;

  return (
    <DefaultDialog open={isOpen} onClose={onClose} title="Something went wrong">
      <DefaultDialogHeader title="Something went wrong" onClose={onClose} showCloseButton={!!dismiss} />
      <DefaultDialogContent>
        <p
          style={{
            color: "var(--muted-foreground, #666)",
            fontSize: "0.875rem",
            lineHeight: "1.5",
            margin: 0,
          }}
        >
          {error.message || "An unexpected error occurred while connecting your wallet."}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          {dismiss && (
            <Button
              variant="outline"
              size="default"
              onClick={dismiss}
            >
              Dismiss
            </Button>
          )}
          <Button
            variant="default"
            size="default"
            onClick={reset}
          >
            {retryLabel}
          </Button>
        </div>
      </DefaultDialogContent>
    </DefaultDialog>
  );
}

// ── Error Boundary Component ──────────────────────────────────────

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, dismissed: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, dismissed: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, dismissed: false });
    this.props.onReset?.();
  };

  handleDismiss = (): void => {
    this.setState((prev) => ({ ...prev, dismissed: true }));
    this.props.onDismiss?.();
  };

  render(): React.ReactNode {
    if (this.state.dismissed) {
      return this.props.children;
    }

    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          reset={this.handleReset}
          dismiss={this.props.onDismiss ? this.handleDismiss : undefined}
          retryLabel={this.props.retryLabel}
        />
      );
    }

    return this.props.children;
  }
}
