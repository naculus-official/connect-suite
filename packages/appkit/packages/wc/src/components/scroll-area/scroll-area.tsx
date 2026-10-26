import { Component, Element, h, Host } from "@stencil/core"

@Component({
  tag: "appkit-scroll-area",
  styleUrl: "scroll-area.css",
  shadow: true,
})
export class AppkitScrollArea {
  @Element() el!: HTMLElement

  private viewport!: HTMLDivElement
  private verticalThumb!: HTMLDivElement
  private horizontalThumb!: HTMLDivElement

  private updateScrollbar = () => {
    const v = this.viewport
    if (!v) return

    if (this.verticalThumb) {
      const h = (v.clientHeight / v.scrollHeight) * 100
      const top = (v.scrollTop / (v.scrollHeight - v.clientHeight)) * (100 - h)
      this.verticalThumb.style.height = Math.max(h, 10) + "%"
      this.verticalThumb.style.transform = `translateY(${top}%)`
    }

    if (this.horizontalThumb) {
      const w = (v.clientWidth / v.scrollWidth) * 100
      const left = (v.scrollLeft / (v.scrollWidth - v.clientWidth)) * (100 - w)
      this.horizontalThumb.style.width = Math.max(w, 10) + "%"
      this.horizontalThumb.style.transform = `translateX(${left}%)`
    }
  }

  private onScroll = () => {
    this.updateScrollbar()
  }

  componentDidLoad() {
    this.updateScrollbar()
    const observer = new ResizeObserver(() => this.updateScrollbar())
    observer.observe(this.viewport)
  }

  render() {
    return (
      <Host>
        <div
          class="viewport"
          ref={(el) => (this.viewport = el as HTMLDivElement)}
          onScroll={this.onScroll}
        >
          <slot />
        </div>
        <div class="scrollbar vertical">
          <div
            class="thumb"
            ref={(el) => (this.verticalThumb = el as HTMLDivElement)}
          />
        </div>
        <div class="scrollbar horizontal">
          <div
            class="thumb"
            ref={(el) => (this.horizontalThumb = el as HTMLDivElement)}
          />
        </div>
      </Host>
    )
  }
}
