import type React from "react";
import { cn } from "./cn";

export type RegistryButton = React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }
>;

export function NativeButton({
  className,
  variant,
  size,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variant === "outline"
          ? "border-input bg-transparent hover:bg-accent"
          : variant === "ghost"
            ? "border-transparent bg-transparent hover:bg-accent"
            : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        size === "sm" ? "h-9 px-3" : size === "icon" ? "h-10 w-10 p-0" : "h-10",
        className,
      )}
      {...props}
    />
  );
}

export function NativeCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function NativeBadge({
  className,
  variant: _variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function NativeInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input {...props} />;
}

export function NativeSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn("h-px bg-border", className)} {...props} />;
}
