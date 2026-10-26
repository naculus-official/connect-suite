/// <reference types="vitest" />
/// @vitest-environment jsdom

// jsdom: HTMLDialogElement missing .close / .showModal
if (typeof HTMLDialogElement !== "undefined" && !("close" in HTMLDialogElement.prototype)) {
  HTMLDialogElement.prototype.close = () => {}
  HTMLDialogElement.prototype.showModal = () => {}
  HTMLDialogElement.prototype.show = () => {}
}

import React from "react"
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import {
  AppkitButton,
  AppkitCard,
  AppkitDialog,
  AppkitInput,
  AppkitSwitch,
  AppkitSelect,
} from "@naculus/connect-appkit-react"

const cases: Array<{
  name: string
  Component: React.ComponentType<{ children?: React.ReactNode; open?: boolean }>
  tag: string
  props?: Record<string, unknown>
}> = [
  { name: "AppkitButton", Component: AppkitButton, tag: "appkit-button" },
  { name: "AppkitCard",    Component: AppkitCard,    tag: "appkit-card" },
  { name: "AppkitDialog",  Component: AppkitDialog,  tag: "appkit-dialog",  props: { open: true } },
  { name: "AppkitInput",   Component: AppkitInput,   tag: "appkit-input" },
  { name: "AppkitSwitch",  Component: AppkitSwitch,  tag: "appkit-switch" },
  { name: "AppkitSelect",  Component: AppkitSelect,  tag: "appkit-select" },
]

describe("WC Components", () => {
  for (const { name, Component, tag, props = {} } of cases) {
    describe(name, () => {
      it("renders custom element", () => {
        const { container } = render(React.createElement(Component, props))
        expect(container.querySelector(tag)).toBeTruthy()
      })

      it("custom element registered with customElements", () => {
        render(React.createElement(Component, props))
        expect(customElements.get(tag)).toBeTruthy()
      })

      it("custom element has shadow DOM", () => {
        const { container } = render(React.createElement(Component, props))
        const el = container.querySelector(tag)!
        expect(el.shadowRoot).toBeTruthy()
      })
    })
  }
})
