import { Component, h, Host } from "@stencil/core"

@Component({ tag: "appkit-card-title", shadow: true })
export class AppkitCardTitle {
  render() {
    return (
      <Host>
        <div style={{ fontSize: "1.5rem", fontWeight: "600", lineHeight: "1", letterSpacing: "-0.025em" }}>
          <slot />
        </div>
      </Host>
    )
  }
}
