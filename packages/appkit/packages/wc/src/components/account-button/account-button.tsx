import { Component, Prop, h, Host } from "@stencil/core"

@Component({
  tag: "appkit-account-button",
  styleUrl: "account-button.css",
  shadow: true,
})
export class AppkitAccountButton {
  @Prop() address = ""

  @Prop() balance: string | null = null

  @Prop() balanceSymbol = "ETH"

  @Prop() showAddress = true

  @Prop() showBalance = false

  @Prop() disabled = false

  private get formattedAddress() {
    const raw = this.address.includes(":") ? this.address.split(":").pop()! : this.address
    if (raw.length <= 12) return raw
    return raw.slice(0, 6) + "..." + raw.slice(-4)
  }

  private get formattedBalance(): string | null {
    if (this.balance === null || this.balance === undefined) return null
    const n = parseFloat(this.balance)
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 }) + " " + this.balanceSymbol
  }

  render() {
    if (!this.address) {
      return (
        <Host>
          <button type="button" class="button" disabled={this.disabled}>
            <slot name="icon" />
            <slot>Connect Wallet</slot>
          </button>
        </Host>
      )
    }

    return (
      <Host>
        <button type="button" class="button" disabled={this.disabled}>
          <slot name="avatar">
            <div class="dot" aria-hidden="true" />
          </slot>
          <div class="address">
            {this.showAddress && <span class="address-text">{this.formattedAddress}</span>}
            {this.showBalance && this.formattedBalance && (
              <span class="balance">{this.formattedBalance}</span>
            )}
            {this.showBalance && this.balance === null && (
              <span class="balance">Loading...</span>
            )}
          </div>
        </button>
      </Host>
    )
  }
}
