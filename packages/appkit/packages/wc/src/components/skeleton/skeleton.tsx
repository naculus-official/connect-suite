import { Component, h, Host } from "@stencil/core"

@Component({
  tag: "appkit-skeleton",
  styleUrl: "skeleton.css",
  shadow: true,
})
export class AppkitSkeleton {
  render() {
    return (
      <Host>
        <div class="skeleton">
          <slot />
        </div>
      </Host>
    )
  }
}
