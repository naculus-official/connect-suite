import { Component, Prop, h, Element, Host } from "@stencil/core"
import type { Locale } from "../../i18n/types"
import { getTranslations } from "../../i18n/translator"

export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"

export type ButtonSize = "default" | "sm" | "lg" | "icon"

/**
 * @slot default - Button content (text, icons, etc.)
 */
@Component({
  tag: "appkit-button",
  styleUrl: "button.css",
  shadow: true,
})
export class AppKitButton {
  @Element() el!: HTMLElement

  /** Visual variant (default, destructive, outline, secondary, ghost, link) */
  @Prop() variant: ButtonVariant = "default"

  /** Size preset (default, sm, lg, icon) */
  @Prop() size: ButtonSize = "default"

  /** Disable the button */
  @Prop() disabled = false

  /** Button type attribute */
  @Prop() type: "button" | "submit" | "reset" = "button"

  /** Locale for i18n (aria-label fallback) */
  @Prop() locale: Locale = "en"

  /** Explicit aria-label (overrides i18n auto-label) */
  @Prop() ariaLabel: string | null = null

  /** Click event name to dispatch */
  @Prop() eventName = "appkit-click"

  private get t() {
    return getTranslations(this.locale)
  }

  private handleClick = (e: MouseEvent) => {
    if (this.disabled) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    this.el.dispatchEvent(
      new CustomEvent(this.eventName, {
        bubbles: true,
        composed: true,
        detail: { source: this.el },
      }),
    )
  }

  render() {
    return (
      <Host>
        <button
          class={`button variant-${this.variant} size-${this.size}`}
          type={this.type}
          disabled={this.disabled}
          aria-disabled={this.disabled ? "true" : undefined}
          aria-label={this.ariaLabel}
          onClick={this.handleClick}
        >
          <slot />
        </button>
      </Host>
    )
  }
}
