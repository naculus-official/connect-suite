import { Component, Prop, h, Host, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-checkbox",
  styleUrl: "checkbox.css",
  shadow: true,
})
export class AppkitCheckbox {
  @Prop({ mutable: true }) checked = false

  @Prop() disabled = false

  @Prop() label = ""

  @Prop() name = ""

  @Prop() value = "on"

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
            class="checkbox"
            type="checkbox"
            checked={this.checked}
            disabled={this.disabled}
            name={this.name}
            value={this.value}
            onChange={this.handleChange}
            aria-label={this.label || undefined}
          />
          {this.label && <span class="label">{this.label}</span>}
          {!this.label && <slot />}
        </label>
      </Host>
    )
  }
}
