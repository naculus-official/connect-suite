import { Component, Prop, h, Host } from "@stencil/core"

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link"

@Component({
  tag: "appkit-badge",
  styleUrl: "badge.css",
  shadow: true,
})
export class AppkitBadge {
  @Prop() variant: BadgeVariant = "default"

  render() {
    return (
      <Host>
        <span class={`badge variant-${this.variant}`}>
          <slot />
        </span>
      </Host>
    )
  }
}
