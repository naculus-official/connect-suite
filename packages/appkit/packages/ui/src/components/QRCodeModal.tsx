"use client";

import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Smartphone, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type QRCodeType from "qrcode";
import { DefaultDialog } from "../lib/ui-defaults";
import { useComponentRegistry } from "../contexts/ComponentRegistry";
import { useIsMobile } from "../hooks/useIsMobile";

export type QRCodeModalStatus = "pending" | "scanned" | "expired" | "error";

export interface QRCodeModalProps {
  uri: string | null;
  open: boolean;
  onClose: () => void;
  onDeepLink?: (uri: string) => void;
  onRetry?: () => void;
  status?: QRCodeModalStatus;
  showDeepLink?: boolean;
  timeoutMs?: number;
  title?: string;
  description?: string;
  className?: string;
}

async function renderQR(canvas: HTMLCanvasElement, uri: string): Promise<void> {
  // Import the browser entry explicitly: the package's generic entry points
  // target Node's `require`, which is not available in browser-only bundles.
  // Bundlers expose the renderer either on the namespace or under `default`.
  const loaded = (await import("qrcode/lib/browser.js")) as unknown as {
    default?: typeof QRCodeType;
    toCanvas?: typeof QRCodeType.toCanvas;
  };
  const qrcode = loaded.default ?? loaded;
  const toCanvas = qrcode.toCanvas ?? loaded.toCanvas;
  if (typeof toCanvas !== "function") {
    throw new Error("qrcode.toCanvas is unavailable");
  }
  return new Promise((resolve, reject) => {
    toCanvas(canvas, uri, { width: 280, margin: 2 }, (err: Error | null | undefined) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function QRCodeModal({
  uri, open, onClose, onDeepLink, onRetry,
  status = "pending",
  showDeepLink: explicitShowDeepLink,
  timeoutMs = 5 * 60 * 1000,
  title = "Scan with WalletConnect",
  description = "Open your wallet app and scan this QR code to connect.",
  className,
}: QRCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const isMobile = useIsMobile();
  const registry = useComponentRegistry();
  const Button = registry.Button as React.ComponentType<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; children?: React.ReactNode; className?: string }> | undefined;
  const showDeepLink = explicitShowDeepLink ?? isMobile;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !uri || !canvasRef.current) return;
    setQrError(null);
    renderQR(canvasRef.current, uri).catch((error: unknown) => {
      setQrError(error instanceof Error ? error.message : "Unable to render QR code");
    });
  }, [open, uri]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: timeoutMs restarts the countdown when the timeout changes
  useEffect(() => {
    if (!open || status !== "pending") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setTimeElapsed(0);
      return;
    }
    const start = Date.now();
    timerRef.current = setInterval(() => setTimeElapsed(Date.now() - start), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [open, status, timeoutMs]);

  const isExpired = timeElapsed >= timeoutMs && status === "pending";
  const needsNewCode = isExpired || status === "expired" || status === "error";
  const remaining = Math.max(0, Math.ceil((timeoutMs - timeElapsed) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = Math.min(timeElapsed / timeoutMs, 1);

  const handleDeepLink = useCallback(() => { if (uri && onDeepLink) onDeepLink(uri); }, [uri, onDeepLink]);

  const qrContent = uri && !isExpired && status === "pending" ? (
    qrError ? (
      <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-muted rounded-lg gap-2">
        <AlertCircle size={24} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Failed to render QR code</span>
      </div>
    ) : (
      <canvas
        ref={canvasRef}
        width={280}
        height={280}
        role="img"
        aria-label="WalletConnect pairing QR code"
        className="rounded-lg border border-border"
      />
    )
  ) : (
    <div className="flex flex-col items-center justify-center gap-3 bg-muted rounded-lg w-[280px] h-[280px]">
      {status === "scanned" ? (
        <CheckCircle2 size={48} className="text-[hsl(var(--primary))]" />
      ) : (
        <AlertCircle size={48} className="text-destructive" />
      )}
      <span className="text-sm text-muted-foreground" data-testid="status-label">
        {status === "scanned" ? "QR code scanned! Connecting..." :
         isExpired || status === "expired" ? "Connection timed out." :
         "Something went wrong. Try again."}
      </span>
    </div>
  );

  const ModalComp = registry.Modal as React.ComponentType<React.PropsWithChildren<{ open: boolean; onClose?: () => void; closable?: boolean; title?: string; className?: string; children: React.ReactNode }>> | undefined;
  const ModalToUse = ModalComp ?? DefaultDialog;

  return (
    <ModalToUse open={open} onClose={onClose} closable title={title} className={className}>
      <div className="p-6">
        <div className="sticky top-0 z-10 -mx-1 mb-5 bg-card px-1 py-1 text-center">
          <div className="flex justify-center mb-3">
            {status === "pending" && !isExpired && (
              <Loader2 size={20} className="animate-spin text-primary" data-testid="loader-icon-inline" />
            )}
          </div>
          <h3 className="text-lg font-semibold m-0 text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1.5 mb-0">{description}</p>
          )}
        </div>

        <div className="flex justify-center mb-4">{qrContent}</div>

        {status === "pending" && !isExpired && (
          <div className="mb-3">
            <div className="h-1 bg-muted rounded-full overflow-hidden" role="progressbar"
              aria-valuenow={Math.round((1 - progress) * 100)}
              aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000"
                style={{ width: `${(1 - progress) * 100}%` }}
              />
            </div>
            <p data-testid="countdown" className="text-xs text-muted-foreground text-center mt-1.5 mb-0">
              Expires in {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
          </div>
        )}

        <div data-dialog-actions className="sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t border-border bg-card px-1 pb-[max(0rem,env(safe-area-inset-bottom))] pt-3">
          {showDeepLink && uri && status === "pending" && !isExpired && (
            <button type="button"
              onClick={handleDeepLink}
              className="inline-flex items-center justify-center gap-2 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Smartphone size={16} /> Open in Wallet App
            </button>
          )}
          {needsNewCode && onRetry && (
            Button ? (
              <Button
                onClick={onRetry}
                variant="default"
                size="default"
                className="w-full"
              >
                <RefreshCw size={16} /> Generate New QR Code
              </Button>
            ) : (
              <button type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-all duration-200 cursor-pointer border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <RefreshCw size={16} /> Generate New QR Code
              </button>
            )
          )}
          {Button ? (
            <Button
              onClick={onClose}
              variant="outline"
              size="default"
              className="w-full"
            >
              Cancel
            </Button>
          ) : (
            <button type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </ModalToUse>
  );
}
