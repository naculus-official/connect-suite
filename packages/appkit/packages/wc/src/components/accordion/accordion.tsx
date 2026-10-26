import { Component, Prop, h, Host, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-accordion",
  styleUrl: "accordion.css",
  shadow: true,
})
export class AppkitAccordion {
  @Prop() label = ""

  @Prop({ mutable: true }) open = false

  @Prop() disabled = false

  @Event() appkitToggle!: EventEmitter<boolean>

  private toggle = () => {
    if (this.disabled) return
    this.open = !this.open
    this.appkitToggle.emit(this.open)
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      this.toggle()
    }
  }

  render() {
    return (
      <Host>
        <button type="button"
          class="trigger"
          aria-expanded={this.open ? "true" : "false"}
          disabled={this.disabled}
          onClick={this.toggle}
          onKeyDown={this.handleKeyDown}
        >
          <span>{this.label}</span>
          <svg aria-hidden="true" class={{ chevron: true, open: this.open }} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div class={{ content: true, open: this.open }}>
          <div class="content-inner">
            <slot />
          </div>
        </div>
      </Host>
    )
  }
}
