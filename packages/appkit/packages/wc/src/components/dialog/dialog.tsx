import { Component, Prop, Watch, h, Host, Element, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-dialog",
  styleUrl: "dialog.css",
  shadow: true,
})
export class AppkitDialog {
  @Element() el!: HTMLElement

  @Prop({ mutable: true, reflect: true }) open = false

  @Prop() heading = ""

  /** Emitted when dialog is closed (Escape, backdrop click, or close button) */
  @Event() appkitClose!: EventEmitter<void>

  @Event() appkitOpenChange!: EventEmitter<boolean>

  private dialogEl?: HTMLDialogElement

  private handleClose = () => {
    this.open = false
    this.appkitClose.emit()
    this.appkitOpenChange.emit(false)
  }

  @Watch("open")
  onOpenChange(newVal: boolean) {
    if (!this.dialogEl) return
    if (newVal) {
      if (!this.dialogEl.open) this.dialogEl.showModal()
    } else {
      this.dialogEl.close()
    }
  }

  componentDidLoad() {
    if (this.open && this.dialogEl && !this.dialogEl.open) {
      this.dialogEl.showModal()
    }
  }

  disconnectedCallback() {
    this.dialogEl?.close()
  }

  render() {
    return (
      <Host>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click closes on the backdrop; the native <dialog> closes on Escape itself */}
        <dialog
          ref={(el) => (this.dialogEl = el as HTMLDialogElement)}
          onClose={this.handleClose}
          onClick={(e) => {
            if (e.target === this.dialogEl) this.handleClose()
          }}
        >
          <div class="header">
            <h2 class="title">{this.heading}</h2>
            <button type="button" class="close" onClick={this.handleClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div class="content">
            <slot />
          </div>
        </dialog>
      </Host>
    )
  }
}
