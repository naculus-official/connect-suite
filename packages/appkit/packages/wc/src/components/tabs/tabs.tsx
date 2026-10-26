import { Component, Prop, State, h, Host, Event, type EventEmitter } from "@stencil/core"

export interface Tab {
  id: string
  label: string
  disabled?: boolean
}

@Component({
  tag: "appkit-tabs",
  styleUrl: "tabs.css",
  shadow: true,
})
export class AppkitTabs {
  /** JSON string of Tab[] — parsed internally */
  @Prop() tabsJson = "[]"

  /** Currently selected tab id */
  @Prop({ mutable: true }) selected = ""

  @Event() appkitTabChange!: EventEmitter<string>

  @State() private internalSelected = ""

  private get tabs(): Tab[] {
    try {
      return JSON.parse(this.tabsJson)
    } catch {
      return []
    }
  }

  private get activeTab(): string {
    return this.selected || this.internalSelected || this.tabs[0]?.id || ""
  }

  private selectTab(id: string) {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.disabled) return
    this.selected = id
    this.internalSelected = id
    this.appkitTabChange.emit(id)
  }

  private handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (this.tabs.length <= 1) return
    let next: number | undefined
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = index + 1
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = index - 1
    } else if (e.key === "Home") {
      next = 0
    } else if (e.key === "End") {
      next = this.tabs.length - 1
    }
    if (next === undefined) return
    e.preventDefault()
    let attempts = 0
    while (attempts < this.tabs.length) {
      const t = this.tabs[next]
      if (t && !t.disabled) {
        this.selectTab(t.id)
        return
      }
      next = e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? next - 1 < 0 ? this.tabs.length - 1 : next - 1
        : (next + 1) % this.tabs.length
      attempts++
    }
  }

  render() {
    const active = this.activeTab
    return (
      <Host role="tablist" aria-orientation="horizontal">
        <div class="tablist">
          {this.tabs.map((tab, i) => (
            <button type="button"
              class={{ tab: true, selected: tab.id === active }}
              role="tab"
              aria-selected={tab.id === active ? "true" : "false"}
              aria-controls={`panel-${tab.id}`}
              disabled={tab.disabled}
              tabIndex={tab.id === active ? 0 : -1}
              onClick={() => this.selectTab(tab.id)}
              onKeyDown={(e) => this.handleKeyDown(e, i)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div class="panel" role="tabpanel" id={`panel-${active}`} aria-labelledby={active}>
          <slot name={active} />
          {/* Default slot shows when no named slot matches */}
          <div style={{ display: "none" }}><slot /></div>
        </div>
      </Host>
    )
  }
}
