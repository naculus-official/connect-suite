import { Component, Prop, State, h, Host, Element, Event, type EventEmitter, Listen } from "@stencil/core"
import { computePosition, offset, flip, shift, arrow as arrowMiddleware } from "@floating-ui/dom"

@Component({
  tag: "appkit-popover",
  styleUrl: "popover.css",
  shadow: true,
})
export class AppkitPopover {
  @Element() el!: HTMLElement

  @Prop({ mutable: true }) open = false

  @Prop() placement: "top" | "bottom" | "left" | "right" = "bottom"

  @Event() appkitOpenChange!: EventEmitter<boolean>

  @State() private internalOpen = false

  private triggerEl?: HTMLElement
  private popoverEl?: HTMLElement
  private arrowEl?: HTMLElement
  /** The element slotted as `trigger`, which carries the ARIA state. */
  private slottedTrigger?: HTMLElement

  get isOpen() { return this.open || this.internalOpen }

  componentDidRender() { this.syncTrigger() }

  disconnectedCallback() { this.releaseTrigger() }

  /**
   * aria-haspopup / aria-expanded must sit on the element a screen reader
   * announces — the slotted trigger button — not on the role-less wrapper.
   */
  private syncTrigger = () => {
    // Not querySelector(":scope > …"): the SSR hydrate DOM does not support :scope.
    const trigger = Array.from(this.el.children).find(c => c.getAttribute("slot") === "trigger") as HTMLElement | undefined
    if (trigger !== this.slottedTrigger) this.releaseTrigger()
    this.slottedTrigger = trigger
    trigger?.setAttribute("aria-haspopup", "dialog")
    trigger?.setAttribute("aria-expanded", String(this.isOpen))
  }

  private releaseTrigger() {
    this.slottedTrigger?.removeAttribute("aria-haspopup")
    this.slottedTrigger?.removeAttribute("aria-expanded")
    this.slottedTrigger = undefined
  }

  @Listen("click", { target: "document" })
  onDocumentClick(e: MouseEvent) {
    if (!this.isOpen) return
    const path = e.composedPath()
    if (!path.includes(this.el)) {
      this.close()
    }
  }

  @Listen("keydown", { target: "document" })
  onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && this.isOpen) {
      // Return focus only when it was ours (or nowhere); an Escape pressed
      // elsewhere on the page must not pull focus back to the trigger.
      const active = document.activeElement
      const returnFocus = !active || active === document.body || this.el.contains(active)
      this.close()
      if (returnFocus) this.slottedTrigger?.focus()
    }
  }

  private toggle = async () => {
    if (this.isOpen) { this.close() }
    else { await this.show() }
  }

  private show = async () => {
    this.internalOpen = true
    this.open = true
    this.appkitOpenChange.emit(true)
    await this.waitForRender()
    if (this.popoverEl && this.triggerEl && this.arrowEl) {
      const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
        this.triggerEl, this.popoverEl,
        {
          placement: this.placement,
          middleware: [offset(8), flip(), shift({ padding: 8 }), arrowMiddleware({ element: this.arrowEl })],
        },
      )
      this.popoverEl.setAttribute("data-placement", finalPlacement)
      this.popoverEl.style.left = `${x}px`
      this.popoverEl.style.top = `${y}px`
      if (middlewareData.arrow) {
        const { x: ax, y: ay } = middlewareData.arrow
        const side = finalPlacement.split("-")[0] as "top" | "bottom" | "left" | "right"
        const staticSide = ({ top: "bottom", right: "left", bottom: "top", left: "right" } as const)[side]
        this.arrowEl.style.left = ax != null ? `${ax}px` : ""
        this.arrowEl.style.top = ay != null ? `${ay}px` : ""
        this.arrowEl.style[staticSide] = "-4px"
      }
    }
  }

  private close = () => {
    this.internalOpen = false
    this.open = false
    this.appkitOpenChange.emit(false)
  }

  private waitForRender() {
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  render() {
    return (
      <Host>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper around the slotted trigger button, whose click and key events bubble here */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the slotted trigger button handles the keyboard; its click bubbles here */}
        <span ref={el => (this.triggerEl = el as HTMLElement)} onClick={this.toggle}>
          <slot name="trigger" onSlotchange={this.syncTrigger} />
        </span>
        <div
          class={{ popover: true, open: this.isOpen }}
          ref={el => (this.popoverEl = el as HTMLElement)}
          role="dialog"
        >
          <div class="arrow" ref={el => (this.arrowEl = el as HTMLElement)} />
          <slot />
        </div>
      </Host>
    )
  }
}
