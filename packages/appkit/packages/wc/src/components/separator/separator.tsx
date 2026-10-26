import { Component, Prop, h, Host } from "@stencil/core"

export type SeparatorOrientation = "horizontal" | "vertical"

@Component({
  tag: "appkit-separator",
  styleUrl: "separator.css",
  shadow: true,
})
export class AppkitSeparator {
  @Prop() orientation: SeparatorOrientation = "horizontal"

  /** When true, separator is purely visual (not announced by screen readers) */
  @Prop() decorative = true

  render() {
    return (
      <Host
        role={this.decorative ? "none" : "separator"}
        aria-orientation={this.decorative ? undefined : this.orientation}
      >
        <div class={`separator orientation-${this.orientation}`} />
      </Host>
    )
  }
}
