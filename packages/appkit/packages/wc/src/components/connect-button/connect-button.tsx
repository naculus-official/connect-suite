import { Component, Prop, State, h, Host, Element, Event, type EventEmitter } from "@stencil/core"

interface TokenBalance { symbol: string; formatted: string | null; name?: string }
interface DiscoveredWallet { id: string; name: string; rdns?: string; icon?: string }

export type ConnectView = "menu" | "loading-qr" | "qr-ready" | "qr-error"

@Component({
  tag: "appkit-connect-button",
  styleUrl: "connect-button.css",
  shadow: true,
})
export class AppkitConnectButton {
  @Element() el!: HTMLElement

  // ── Data props (from adapter) ──────────────────────────────────
  @Prop() connected = false
  @Prop() connecting = false
  @Prop() address = ""
  @Prop() balance: string | null = null
  @Prop() balanceSymbol = "ETH"
  @Prop() isBalanceLoading = false
  @Prop() tokenBalancesJson = "[]"
  @Prop() explorerUrl = ""
  @Prop() explorerLabel = "Explorer"
  @Prop() isMobile = false
  @Prop() mobileWalletName = ""
  @Prop() walletsJson = "[]"
  @Prop() qrUri: string | null = null
  @Prop() qrLoading = false
  @Prop({ mutable: true }) qrError: string | null = null

  // ── Events ─────────────────────────────────────────────────────
  @Event() appkitConnect!: EventEmitter<{ kind: string; walletId?: string }>
  @Event() appkitDisconnect!: EventEmitter<void>
  @Event() appkitStartPairing!: EventEmitter<void>
  @Event() appkitRetry!: EventEmitter<void>
  @Event() appkitCancelPairing!: EventEmitter<void>
  @Event() appkitMobileDeepLink!: EventEmitter<void>
  @Event() appkitCopyAddress!: EventEmitter<string>

  // ── Internal state ───────────────────────────────────────────── 
  @State() modalOpen = false
  @State() view: ConnectView = "menu"
  @State() search = ""
  @State() selectedWalletId = ""
  @State() dropdownOpen = false
  @State() uriCopied = false
  @State() addressCopied = false

  private dialogEl?: HTMLDialogElement
  private canvasEl?: HTMLCanvasElement
  private qrRendered = false

  // ── Computed ───────────────────────────────────────────────────
  private get wallets(): DiscoveredWallet[] {
    try { return JSON.parse(this.walletsJson) } catch { return [] }
  }
  private get tokenBalances(): TokenBalance[] {
    try { return JSON.parse(this.tokenBalancesJson) } catch { return [] }
  }
  private get filteredWallets() {
    if (!this.search) return this.wallets
    return this.wallets.filter(w => w.name.toLowerCase().includes(this.search.toLowerCase()))
  }
  private get shortAddr() {
    const raw = this.address.includes(":") ? this.address.split(":").pop()! : this.address
    if (raw.length <= 12) return raw
    return raw.slice(0, 6) + "..." + raw.slice(-4)
  }
  private get fullAddr() {
    return this.address.includes(":") ? this.address.split(":").pop()! : this.address
  }
  private get fmtBalance(): string | null {
    if (this.balance === null || this.balance === undefined) return null
    return parseFloat(this.balance).toLocaleString(undefined, { maximumFractionDigits: 4 }) + " " + this.balanceSymbol
  }

  // ── Modal methods ──────────────────────────────────────────────
  private openModal() {
    this.view = "menu"; this.search = ""; this.qrError = null
    this.modalOpen = true
    setTimeout(() => this.dialogEl?.showModal(), 0)
  }
  private closeModal() {
    if (this.view !== "menu") this.appkitCancelPairing.emit()
    this.modalOpen = false
    this.dialogEl?.close()
  }

  private goToWC() {
    this.view = "loading-qr"; this.qrError = null
    this.appkitStartPairing.emit()
  }

  private selectWallet(id: string) {
    this.search = ""
    this.selectedWalletId = id
    this.appkitConnect.emit({ kind: "injected", walletId: id })
  }

  private copyAddress() {
    navigator.clipboard.writeText(this.fullAddr).then(() => {
      this.addressCopied = true
      setTimeout(() => (this.addressCopied = false), 2000)
    })
  }

  private copyUri() {
    if (!this.qrUri) return
    navigator.clipboard.writeText(this.qrUri).then(() => {
      this.uriCopied = true
      setTimeout(() => (this.uriCopied = false), 2000)
    })
  }

  private get selectedWallet() {
    return this.wallets.find(w => w.id === this.selectedWalletId)
  }

  // ── QR rendering ───────────────────────────────────────────────
  componentDidUpdate() {
    if (this.view === "qr-ready" && this.qrUri && this.canvasEl && !this.qrRendered) {
      this.renderQR()
    }
  }

  private async renderQR() {
    if (!this.canvasEl || !this.qrUri) return
    try {
      const qrcode = await import("qrcode")
      await (qrcode.default || qrcode).toCanvas(this.canvasEl, this.qrUri, { width: 200, margin: 2 })
      this.qrRendered = true
    } catch { /* qrcode load failed */ }
  }

  // ── Watch qrUri changes from adapter ───────────────────────────
  componentWillRender() {
    if (this.qrLoading && this.view !== "loading-qr") {
      this.view = "loading-qr"
    }
    if (this.qrUri && this.view === "loading-qr") {
      this.view = "qr-ready"
      this.qrRendered = false
      this.qrError = null
    }
  }

  disconnectedCallback() {
    this.dialogEl?.close()
  }

  // ── Render ─────────────────────────────────────────────────────
  render() {
    // Connected state
    if (this.connected && this.address) {
      return (
        <Host>
          <appkit-button
            variant="ghost"
            size="sm"
            class="wallet-badge"
            onClick={() => (this.dropdownOpen = !this.dropdownOpen)}
          >
            <span class="dot" slot="" />
            <span class="addr-text">{this.shortAddr}</span>
            {this.isBalanceLoading ? (
              <span class="load-skel" />
            ) : this.fmtBalance ? (
              <span class="bal-text">{this.fmtBalance}</span>
            ) : null}
          </appkit-button>
          {this.dropdownOpen && (
            // biome-ignore lint/a11y/useSemanticElements: role=region on the styled panel; a <section> would change the component's CSS hooks
            <div class="dropdown" role="region" aria-label="Wallet details" ref={(el: any) => this.setupDropdownClose(el)}>
              <div class="dd-status"><span class="dot" /> Connected</div>
              <div class="dd-addr-row">
                <span class="dd-addr">{this.fullAddr.slice(0, 8)}...{this.fullAddr.slice(-6)}</span>
                <appkit-button variant="ghost" size="sm" onClick={() => this.copyAddress()}>
                  {this.addressCopied ? "✓" : "📋"}
                </appkit-button>
                {this.explorerUrl && (
                  <a
                    href={`${this.explorerUrl}/address/${this.fullAddr}`}
                    target="_blank"
                    rel="noreferrer"
                    class="expl-link"
                    aria-label={this.explorerLabel}
                    title={this.explorerLabel}
                  >↗</a>
                )}
              </div>
              <div class="dd-balance">
                <div class="dd-label">Balance</div>
                {this.isBalanceLoading ? (
                  <div class="load-skel-lg" />
                ) : this.fmtBalance ? (
                  <div class="dd-bal-val">{this.fmtBalance}</div>
                ) : <div class="dd-bal-val">—</div>}
              </div>
              {this.tokenBalances.length > 0 && (
                <div class="dd-tokens">
                  <div class="dd-label">Tokens</div>
                  {this.tokenBalances.map(tb => (
                    <div class="dd-token-row">
                      <span>{tb.name || tb.symbol}</span>
                      <span>{tb.formatted ?? "—"}</span>
                    </div>
                  ))}
                </div>
              )}
              <appkit-button variant="ghost" class="dd-disconnect" onClick={() => { this.appkitDisconnect.emit(); this.dropdownOpen = false }}>
                Disconnect
              </appkit-button>
            </div>
          )}
        </Host>
      )
    }

    // Disconnected
    return (
      <Host>
        <appkit-button
          onClick={() => this.openModal()}
          disabled={this.connecting}
          ariaLabel={this.connecting ? "Connecting" : "Connect Wallet"}
        >
          {this.connecting ? "Connecting..." : "Connect Wallet"}
        </appkit-button>

        {this.modalOpen && (
          <dialog ref={el => (this.dialogEl = el as HTMLDialogElement)} onClose={() => this.closeModal()}>
            <div class="modal">
              <div class="modal-header">
                {this.view !== "menu" ? (
                  <appkit-button variant="ghost" size="sm" onClick={() => { this.view = "menu"; this.qrError = null }}>
                    ← Back
                  </appkit-button>
                ) : <div />}
                <div class="modal-title">
                  {this.view === "menu" ? "Connect a wallet" : "Scan QR Code"}
                </div>
                {this.view !== "menu" ? <div /> : null}
              </div>

              {/* Menu view */}
              {this.view === "menu" && (
                <div class="menu-body">
                  {this.wallets.length > 3 && (
                    <appkit-input placeholder="Search wallets..." value={this.search} onAppkitChange={(e: CustomEvent) => this.search = e.detail} />
                  )}
                  {this.filteredWallets.length === 0 ? (
                    <div class="no-wallets">No wallets detected</div>
                  ) : (
                    this.filteredWallets.map(w => (
                      <appkit-button variant="outline" class="wc-opt" onClick={() => this.selectWallet(w.id)}>
                        <span class="wc-name">{w.name}</span>
                        <span class="wc-desc">Browser extension</span>
                      </appkit-button>
                    ))
                  )}
                  <div class="divider"><span>WalletConnect</span></div>
                  <button type="button" class="wc-btn" onClick={() => this.goToWC()}>
                    <span class="wc-name">WalletConnect</span>
                    <span class="wc-desc">Scan QR with any wallet</span>
                  </button>
                  {this.isMobile && this.mobileWalletName && (
                    <button type="button"
                      class="wc-btn"
                      onClick={() => this.appkitMobileDeepLink.emit()}
                    >
                      <span class="wc-name">Open {this.mobileWalletName}</span>
                      <span class="wc-desc">Continue in your mobile wallet</span>
                    </button>
                  )}
                  <button type="button" class="wc-btn" onClick={() => this.closeModal()}>
                    Close
                  </button>
                </div>
              )}

              {/* QR views */}
              {this.view === "loading-qr" && (
                <div class="qr-center">
                  <div class="qr-spinner" />
                  <div>Waiting for connection...</div>
                </div>
              )}
              {this.view === "qr-ready" && (
                <div class="qr-center">
                  {this.selectedWallet && (
                    <div class="qr-wallet-name">{this.selectedWallet.name}</div>
                  )}
                  <canvas ref={el => (this.canvasEl = el as HTMLCanvasElement)} width="200" height="200" class="qr-canvas" />
                  <appkit-button variant="outline" size="sm" onClick={() => this.copyUri()}>
                    {this.uriCopied ? "✓ Copied" : "Copy link"}
                  </appkit-button>
                  <appkit-button variant="ghost" size="sm" onClick={() => this.closeModal()}>
                    Cancel
                  </appkit-button>
                </div>
              )}
              {this.view === "qr-error" && (
                <div class="qr-center">
                  <div class="qr-error-text">{this.qrError || "Connection failed"}</div>
                  <appkit-button variant="default" size="sm" onClick={() => this.appkitRetry.emit()}>Retry</appkit-button>
                  <appkit-button variant="ghost" size="sm" onClick={() => this.closeModal()}>
                    Cancel
                  </appkit-button>
                </div>
              )}
              {this.view === "loading-qr" && (
                <appkit-button variant="ghost" size="sm" onClick={() => this.closeModal()}>
                  Cancel
                </appkit-button>
              )}
            </div>
            <div class="modal-footer">Powered by Naculus</div>
          </dialog>
        )}
      </Host>
    )
  }

  private setupDropdownClose(el: HTMLElement | null) {
    if (!el) return
    const handler = (e: MouseEvent) => {
      if (!el.contains(e.target as Node) && !this.el.contains(e.target as Node)) {
        this.dropdownOpen = false
        document.removeEventListener("click", handler)
      }
    }
    requestAnimationFrame(() => document.addEventListener("click", handler))
  }
}
