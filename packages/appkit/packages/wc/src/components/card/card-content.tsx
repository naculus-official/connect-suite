import { Component, h, Host } from "@stencil/core"

@Component({ tag: "appkit-card-content", shadow: true })
export class AppkitCardContent {
  render() {
    return (
      <Host>
        <div style={{ padding: "1.5rem", paddingTop: "0" }}>
          <slot />
        </div>
      </Host>
    )
  }
}
