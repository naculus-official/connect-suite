import { Component, h, Host } from "@stencil/core"

@Component({ tag: "appkit-card-footer", shadow: true })
export class AppkitCardFooter {
  render() {
    return (
      <Host>
        <div style={{ display: "flex", alignItems: "center", padding: "1.5rem", paddingTop: "0", gap: "0.5rem" }}>
          <slot />
        </div>
      </Host>
    )
  }
}
