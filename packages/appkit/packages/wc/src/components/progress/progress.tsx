import { Component, Prop, h, Host } from "@stencil/core"

@Component({
  tag: "appkit-progress",
  styleUrl: "progress.css",
  shadow: true,
})
export class AppkitProgress {
  /** Progress value (0-100) */
  @Prop() value = 0

  /** Maximum value */
  @Prop() max = 100

  /** Accessible label */
  @Prop() label = ""

  render() {
    const pct = Math.max(0, Math.min(100, (this.value / this.max) * 100))
    return (
      <Host
        role="progressbar"
        aria-valuenow={this.value}
        aria-valuemin={0}
        aria-valuemax={this.max}
        aria-label={this.label || undefined}
      >
        <div class="progress">
          <div
            class="indicator"
            style={{ transform: `translateX(-${100 - pct}%)` }}
          />
        </div>
      </Host>
    )
  }
}
