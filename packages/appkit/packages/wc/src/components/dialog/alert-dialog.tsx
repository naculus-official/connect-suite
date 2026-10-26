import { Component, Prop, Watch, h, Host, Element, Event, type EventEmitter } from "@stencil/core"

@Component({
  tag: "appkit-alert-dialog",
  styleUrl: "alert-dialog.css",
  shadow: true,
})
export class AppkitAlertDialog {
  @Element() el!: HTMLElement

  @Prop({ mutable: true, reflect: true }) open = false

  @Prop() heading = ""

  @Prop() description = ""

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
          aria-labelledby="alert-title"
          aria-describedby="alert-desc"
          onClick={(e) => {
            if (e.target === this.dialogEl) this.handleClose()
          }}
        >
          <div class="title" id="alert-title">{this.heading}</div>
          {this.description && <p class="description" id="alert-desc">{this.description}</p>}
          <slot />
          <div class="footer">
            <slot name="footer" />
          </div>
        </dialog>
      </Host>
    )
  }
}
