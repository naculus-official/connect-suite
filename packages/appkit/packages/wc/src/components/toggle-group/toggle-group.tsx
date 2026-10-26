import { Component, Prop, h, Host, Event, type EventEmitter } from "@stencil/core"

export interface ToggleItem {
  id: string
  label: string
  disabled?: boolean
}

@Component({
  tag: "appkit-toggle-group",
  styleUrl: "toggle-group.css",
  shadow: true,
})
export class AppkitToggleGroup {
  /** JSON string of ToggleItem[] */
  @Prop() itemsJson = "[]"

  /** Comma-separated list of selected item IDs */
  @Prop({ mutable: true }) selected: string[] = []

  @Prop() multiple = false

  @Event() appkitChange!: EventEmitter<string[]>

  private get items(): ToggleItem[] {
    try { return JSON.parse(this.itemsJson) } catch { return [] }
  }

  private toggle(id: string) {
    if (this.multiple) {
      this.selected = this.selected.includes(id)
        ? this.selected.filter(s => s !== id)
        : [...this.selected, id]
    } else {
      this.selected = this.selected.includes(id) ? [] : [id]
    }
    this.appkitChange.emit(this.selected)
  }

  render() {
    return (
      <Host role="group">
        {this.items.map(item => (
          // biome-ignore lint/a11y/useSemanticElements: ARIA toggle-button pattern (button with role=checkbox and aria-checked)
          <button type="button"
            key={item.id}
            class={{ item: true, pressed: this.selected.includes(item.id) }}
            role="checkbox"
            aria-checked={this.selected.includes(item.id) ? "true" : "false"}
            disabled={item.disabled}
            onClick={() => this.toggle(item.id)}
          >
            {item.label}
          </button>
        ))}
      </Host>
    )
  }
}
