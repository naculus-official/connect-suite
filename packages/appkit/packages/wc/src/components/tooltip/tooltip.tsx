import { Component, Prop, State, h, Host, Element } from "@stencil/core"
import { computePosition, offset, flip, shift, arrow as arrowMiddleware } from "@floating-ui/dom"

@Component({
  tag: "appkit-tooltip",
  styleUrl: "tooltip.css",
  shadow: true,
})
export class AppkitTooltip {
  @Element() el!: HTMLElement

  @Prop() content = ""

  @Prop() placement: "top" | "bottom" | "left" | "right" = "top"

  @State() visible = false

  private triggerEl?: HTMLElement
  private tooltipEl?: HTMLElement
  private arrowEl?: HTMLElement
  private hideTimeout?: number

  private show = async () => {
    this.visible = true
    await this.waitForRender()
    if (this.triggerEl && this.tooltipEl) {
      const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
        this.triggerEl,
        this.tooltipEl,
        {
          placement: this.placement,
          middleware: [
            offset(6),
            flip(),
            shift({ padding: 8 }),
            arrowMiddleware({ element: this.arrowEl! }),
          ],
        },
      )
      this.tooltipEl.setAttribute("data-placement", finalPlacement)
      this.tooltipEl.style.left = `${x}px`
      this.tooltipEl.style.top = `${y}px`
      if (middlewareData.arrow && this.arrowEl) {
        const { x: ax, y: ay } = middlewareData.arrow
        const side = finalPlacement.split("-")[0] as "top" | "bottom" | "left" | "right"
        const staticSide = ({ top: "bottom", right: "left", bottom: "top", left: "right" } as const)[side]
        this.arrowEl.style.left = ax != null ? `${ax}px` : ""
        this.arrowEl.style.top = ay != null ? `${ay}px` : ""
        this.arrowEl.style[staticSide] = "-4px"
      }
    }
  }

  private hide = () => {
    this.hideTimeout = window.setTimeout(() => {
      this.visible = false
    }, 100)
  }

  private cancelHide = () => {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = undefined
    }
  }

  private waitForRender() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }

  render() {
    return (
      <Host
        onMouseEnter={this.show}
        onMouseLeave={this.hide}
        onFocus={this.show}
        onBlur={this.hide}
      >
        <span ref={(el) => (this.triggerEl = el as HTMLElement)}>
          <slot />
        </span>
        <div
          class={{ tooltip: true, visible: this.visible }}
          ref={(el) => (this.tooltipEl = el as HTMLElement)}
          role="tooltip"
          onMouseEnter={this.cancelHide}
          onMouseLeave={this.hide}
        >
          <div class="arrow" ref={(el) => (this.arrowEl = el as HTMLElement)} />
          {this.content}
        </div>
      </Host>
    )
  }
}
