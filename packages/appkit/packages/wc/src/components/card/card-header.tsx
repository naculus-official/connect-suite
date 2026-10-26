import { Component, h, Host } from "@stencil/core"

@Component({ tag: "appkit-card-header", shadow: true })
export class AppkitCardHeader {
  render() {
    return (
      <Host>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", padding: "1.5rem" }}>
          <slot />
        </div>
      </Host>
    )
  }
}
