import { Component, Prop, h, Host, Element, Event, type EventEmitter, Listen, State } from "@stencil/core"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  icon?: string
}

@Component({
  tag: "appkit-select",
  styleUrl: "select.css",
  shadow: true,
})
export class AppkitSelect {
  @Element() el!: HTMLElement

  /** JSON string of SelectOption[] */
  @Prop() optionsJson = "[]"

  @Prop({ mutable: true }) value = ""

  @Prop() placeholder = "Select..."

  @Prop() disabled = false

  @State() open = false

  @State() focusIdx = -1

  @Event() appkitChange!: EventEmitter<string>

  private get options(): SelectOption[] {
    try { return JSON.parse(this.optionsJson) } catch { return [] }
  }

  private get label(): string {
    return this.options.find(o => o.value === this.value)?.label || ""
  }

  private select(val: string) {
    this.value = val
    this.open = false
    this.appkitChange.emit(val)
  }

  @Listen("click", { target: "document" })
  onDocClick(e: MouseEvent) {
    if (!this.open) return
    if (!this.el.contains(e.target as Node)) this.open = false
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        this.open = true
        this.focusIdx = 0
      }
      return
    }
    if (e.key === "Escape") { this.open = false; return }
    if (e.key === "ArrowDown") { e.preventDefault(); this.focusIdx = Math.min(this.focusIdx + 1, this.options.length - 1) }
    if (e.key === "ArrowUp") { e.preventDefault(); this.focusIdx = Math.max(this.focusIdx - 1, 0) }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (this.focusIdx >= 0) this.select(this.options[this.focusIdx]?.value)
    }
  }

  render() {
    return (
      <Host>
        <button type="button"
          class="trigger"
          disabled={this.disabled}
          aria-haspopup="listbox"
          aria-expanded={this.open ? "true" : "false"}
          onClick={() => { this.open = !this.open; this.focusIdx = 0 }}
          onKeyDown={(e) => this.handleKeyDown(e)}
          role="combobox"
        >
          <span class={{ placeholder: !this.value }}>
            {this.options.find(o => o.value === this.value)?.icon && (
              <span class="option-icon">{this.options.find(o => o.value === this.value)?.icon}</span>
            )}
            {this.label || this.placeholder}
          </span>
          <svg aria-hidden="true" class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div class={{ options: true, open: this.open }} role="listbox">
          {this.options.map((opt, i) => (
            <button type="button"
              class={{ option: true, selected: opt.value === this.value, focused: i === this.focusIdx }}
              role="option"
              aria-selected={opt.value === this.value ? "true" : "false"}
              disabled={opt.disabled}
              onClick={() => this.select(opt.value)}
              onMouseEnter={() => (this.focusIdx = i)}
            >
              {opt.icon && <span class="option-icon">{opt.icon}</span>}
              {opt.label}
              <svg aria-hidden="true" class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          ))}
        </div>
      </Host>
    )
  }
}
