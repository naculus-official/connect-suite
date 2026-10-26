import { Component, Prop, h, Host, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-switch",
  styleUrl: "switch.css",
  shadow: true,
})
export class AppkitSwitch {
  @Prop({ mutable: true }) checked = false

  @Prop() disabled = false

  @Prop() label = ""

  @Event() appkitChange!: EventEmitter<boolean>

  private handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    this.checked = target.checked
    this.appkitChange.emit(this.checked)
  }

  render() {
    return (
      <Host>
        <label class="container">
          <input
            class="switch"
            type="checkbox"
            role="switch"
            checked={this.checked}
            disabled={this.disabled}
            onChange={this.handleChange}
            aria-label={this.label || undefined}
            aria-checked={this.checked}
          />
          {this.label && <span class="label">{this.label}</span>}
        </label>
      </Host>
    )
  }
}
