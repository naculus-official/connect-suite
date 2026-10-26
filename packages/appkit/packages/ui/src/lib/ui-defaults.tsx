"use client"

import type React from "react"
import { useEffect } from "react"
import { cn } from "./cn"
import { X } from "lucide-react"

/** Inline fallback Button — pure CSS, no Radix/shadcn dependency. */
export function DefaultButton({
  children,
  className = "",
  onClick,
  disabled = false,
  variant = "default",
  size = "default",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  children: React.ReactNode
}) {
  const variantClasses: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  }
  const sizeClasses: Record<string, string> = {
    default: "h-10 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-10 w-10",
  }
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg",
        "text-sm font-medium transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "font-inherit no-underline box-border border-0 m-0",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </button>
  )
}

/** Inline fallback Dialog — pure CSS, no Radix/shadcn dependency. */
export function DefaultDialog({
  open,
  onClose,
  children,
  closable,
  className,
  title,
}: {
  open: boolean
  onClose?: () => void
  children: React.ReactNode
  closable?: boolean
  className?: string
  title?: string
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open || !onClose) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className={cn("naculus-dialog-viewport fixed inset-0 z-50 flex items-center justify-center p-4", className)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="absolute inset-0 bg-black/80"
        aria-hidden="true"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgb(0 0 0 / 0.8)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        className="naculus-dialog-surface relative z-10 flex w-full max-w-lg flex-col overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-2xl"
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "32rem",
          overflowY: "auto",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          background: "hsl(var(--card, 0 0% 100%))",
          color: "hsl(var(--card-foreground, 222.2 84% 4.9%))",
          boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.4)",
        }}
      >
        {closable && onClose && (
          <button
            onClick={onClose}
            type="button"
            aria-label="Close modal"
            className="absolute right-4 top-4 z-20 rounded-md p-1 text-muted-foreground hover:text-foreground"
            style={{
              position: "absolute",
              right: "1rem",
              top: "1rem",
              zIndex: 20,
              border: 0,
              background: "transparent",
              cursor: "pointer",
              color: "inherit",
            }}
          >
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" data-testid="x-icon" /></svg>
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

export function DefaultDialogHeader({
  title,
  onClose,
  showCloseButton = true,
}: {
  title: string
  onClose?: () => void
  showCloseButton?: boolean
}) {
  return (
    <div className="sticky top-0 z-10 -mx-1 mb-4 flex items-center justify-between bg-card px-1 py-1">
      <h2 className="text-lg font-semibold m-0">{title}</h2>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-all duration-200"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function DefaultDialogContent({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-col gap-4", className)}>{children}</div>
}
