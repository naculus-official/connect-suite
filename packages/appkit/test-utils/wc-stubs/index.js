// Vitest stub — WC custom elements registered during tests
// The actual WC implementations are not needed for unit tests
// since we test React adapter logic, not WC rendering.

export function defineCustomElement() {}

// Export stubs matching the WC package's dist/components structure
export function createStubElements() {
  const elements = [
    "appkit-accordion", "appkit-account-button", "appkit-alert-dialog",
    "appkit-avatar", "appkit-badge", "appkit-button",
    "appkit-card", "appkit-card-content", "appkit-card-description",
    "appkit-card-footer", "appkit-card-header", "appkit-card-title",
    "appkit-checkbox", "appkit-collapsible", "appkit-connect-button",
    "appkit-dialog", "appkit-dropdown-menu", "appkit-input",
    "appkit-popover", "appkit-progress", "appkit-scroll-area",
    "appkit-select", "appkit-separator", "appkit-skeleton",
    "appkit-switch", "appkit-tabs", "appkit-toggle-group", "appkit-tooltip",
  ]
  for (const tag of elements) {
    if (!customElements.get(tag)) {
      customElements.define(tag, class extends HTMLElement {})
    }
  }
}
