import { Component, h, Host } from "@stencil/core"

@Component({ tag: "appkit-card-description", shadow: true })
export class AppkitCardDescription {
  render() {
    return (
      <Host>
        <div style={{ fontSize: "0.875rem", color: "hsl(var(--muted-foreground))" }}>
          <slot />
        </div>
      </Host>
    )
  }
}
