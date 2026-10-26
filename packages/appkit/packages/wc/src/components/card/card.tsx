import { Component, h, Host } from "@stencil/core"

@Component({
  tag: "appkit-card",
  styleUrl: "card.css",
  shadow: true,
})
export class AppkitCard {
  render() {
    return (
      <Host>
        <div class="card">
          <slot />
        </div>
      </Host>
    )
  }
}
