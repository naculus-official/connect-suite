import { Component, Prop, h, Host, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-collapsible",
  styleUrl: "collapsible.css",
  shadow: true,
})
export class AppkitCollapsible {
  @Prop({ mutable: true }) open = false

  @Event() appkitToggle!: EventEmitter<boolean>

  private toggle() {
    this.open = !this.open
    this.appkitToggle.emit(this.open)
  }

  render() {
    return (
      <Host>
        <button type="button" class="trigger" aria-expanded={this.open ? "true" : "false"} onClick={() => this.toggle()}>
          <slot name="trigger" />
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
