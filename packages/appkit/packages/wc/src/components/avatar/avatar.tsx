import { Component, Prop, State, h, Host } from "@stencil/core"

export type AvatarSize = "default" | "sm" | "lg"

@Component({
  tag: "appkit-avatar",
  styleUrl: "avatar.css",
  shadow: true,
})
export class AppkitAvatar {
  @Prop() size: AvatarSize = "default"

  /** Image URL */
  @Prop() src = ""

  /** Alt text for image */
  @Prop() alt = ""

  /** Fallback text when image fails to load (e.g. initials) */
  @Prop() fallback = ""

  @State() private imgError = false

  private handleError = () => {
    this.imgError = true
  }

  render() {
    const showImage = this.src && !this.imgError
    return (
      <Host>
        <div class={`avatar size-${this.size}`}>
          {showImage && (
            <img
              src={this.src}
              alt={this.alt}
              onError={this.handleError}
            />
          )}
          {!showImage && this.fallback && (
            <span class="fallback" aria-hidden="true">
              {this.fallback}
            </span>
          )}
          {!showImage && !this.fallback && (
            <span class="fallback" aria-hidden="true">
              <slot name="fallback" />
            </span>
          )}
        </div>
      </Host>
    )
  }
}
