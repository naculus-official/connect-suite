import { Component, Prop, h, Host, Element, Event, type EventEmitter, Listen, State } from "@stencil/core"
import { computePosition, offset, flip, shift } from "@floating-ui/dom"

export interface MenuItem {
  id: string
  label: string
  destructive?: boolean
  disabled?: boolean
  separator?: boolean
}

@Component({
  tag: "appkit-dropdown-menu",
  styleUrl: "dropdown-menu.css",
  shadow: true,
})
export class AppkitDropdownMenu {
  @Element() el!: HTMLElement

  /** JSON string of MenuItem[] */
  @Prop() itemsJson = "[]"

  @State() open = false

  @State() focusIdx = -1

  @Event() appkitSelect!: EventEmitter<string>

  private triggerEl?: HTMLElement
  private menuEl?: HTMLElement
  /** The element slotted as `trigger`, which carries the ARIA state. */
  private slottedTrigger?: HTMLElement
  private itemEls: Array<HTMLButtonElement | undefined> = []

  private get items(): MenuItem[] {
    try { return JSON.parse(this.itemsJson) } catch { return [] }
  }

  @Listen("click", { target: "document" })
  onDocClick(e: MouseEvent) {
    if (!this.open) return
    // Close without moving focus: the click has already put it where the user wants it.
    if (!this.el.contains(e.target as Node)) this.close()
  }

  private releaseTrigger() {
    this.slottedTrigger?.removeAttribute("aria-haspopup")
    this.slottedTrigger?.removeAttribute("aria-expanded")
    this.slottedTrigger = undefined
  }

  /**
   * aria-haspopup / aria-expanded must sit on the element a screen reader
   * announces — the slotted trigger button — not on the role-less wrapper.
   */
  private syncTrigger = () => {
    // Not querySelector(":scope > …"): the SSR hydrate DOM does not support :scope.
    const trigger = Array.from(this.el.children).find(c => c.getAttribute("slot") === "trigger") as HTMLElement | undefined
    if (trigger !== this.slottedTrigger) this.releaseTrigger()
    this.slottedTrigger = trigger
    trigger?.setAttribute("aria-haspopup", "menu")
    trigger?.setAttribute("aria-expanded", String(this.open))
  }

  componentDidRender() { this.syncTrigger() }

  disconnectedCallback() { this.releaseTrigger() }

  private async toggle() {
    if (this.open) this.close()
    else await this.show("first")
  }

  private async show(initial: "first" | "last") {
    this.open = true
    await this.waitForRender()
    if (this.menuEl && this.triggerEl) {
      const { x, y } = await computePosition(this.triggerEl, this.menuEl, {
        placement: "bottom-start",
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      })
      this.menuEl.style.left = `${x}px`
      this.menuEl.style.top = `${y}px`
    }
    if (!this.open) return
    const enabled = this.enabledIndexes()
    this.focusItem(initial === "first" ? enabled[0] : enabled[enabled.length - 1])
  }

  private close(returnFocus = false) {
    this.open = false
    this.focusIdx = -1
    if (returnFocus) this.slottedTrigger?.focus()
  }

  private select(id: string) {
    this.close(true)
    this.appkitSelect.emit(id)
  }

  /** Indexes of the items that can take focus: not separators, not disabled. */
  private enabledIndexes() {
    return this.items.flatMap((item, i) => (item.separator || item.disabled ? [] : [i]))
  }

  private focusItem(i: number | undefined) {
    if (i === undefined) return
    this.focusIdx = i
    this.itemEls[i]?.focus()
  }

  /** Keys reach the host from both the slotted trigger and the menu items. */
  private handleKeyDown = (e: KeyboardEvent) => {
    const inMenu = !!this.menuEl && e.composedPath().includes(this.menuEl)
    if (!this.open) {
      // Enter / Space are left to the trigger button, whose click toggles the menu.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        void this.show(e.key === "ArrowDown" ? "first" : "last")
      }
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      this.close(true)
      return
    }
    if (e.key === "Tab") { this.close(); return }
    const enabled = this.enabledIndexes()
    if (enabled.length === 0) return
    const pos = enabled.indexOf(this.focusIdx)
    let next: number | undefined
    if (e.key === "ArrowDown") next = pos < 0 ? enabled[0] : enabled[Math.min(pos + 1, enabled.length - 1)]
    else if (e.key === "ArrowUp") next = pos < 0 ? enabled[enabled.length - 1] : enabled[Math.max(pos - 1, 0)]
    else if (e.key === "Home" && inMenu) next = enabled[0]
    else if (e.key === "End" && inMenu) next = enabled[enabled.length - 1]
    if (next === undefined) return
    e.preventDefault()
    this.focusItem(next)
  }

  private waitForRender() {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  render() {
    return (
      <Host onKeyDown={this.handleKeyDown}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper around the slotted trigger button, whose click events bubble here */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the slotted trigger button handles the keyboard; its click bubbles here */}
        <span ref={el => (this.triggerEl = el as HTMLElement)} onClick={() => this.toggle()}>
          <slot name="trigger" onSlotchange={this.syncTrigger} />
        </span>
        <div
          class={{ menu: true, open: this.open }}
          ref={el => (this.menuEl = el as HTMLElement)}
          role="menu"
        >
          {this.items.map((item, i) => {
            // biome-ignore lint/a11y/useSemanticElements: role=separator on a styled div; an <hr> brings its own borders and margins
            if (item.separator) return <div key={`s-${i}`} class="separator" role="separator" />
            return (
              <button type="button"
                key={item.id}
                ref={el => (this.itemEls[i] = el as HTMLButtonElement | undefined)}
                class={{ item: true, focused: i === this.focusIdx, destructive: !!item.destructive }}
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onMouseEnter={() => { if (!item.disabled) this.focusItem(i) }}
                onClick={() => this.select(item.id)}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </Host>
    )
  }
}
