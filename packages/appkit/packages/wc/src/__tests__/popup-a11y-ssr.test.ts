/// <reference types="vitest" />
/// @vitest-environment jsdom

// The hydrate (SSR) script runs componentDidRender on Stencil's mock DOM,
// which lacks parts of the browser DOM (e.g. the :scope selector).
import { describe, it, expect } from "vitest"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { renderToString } = require("../../hydrate/index.js") as typeof import("../../hydrate/index.js")

describe("popup triggers under SSR", () => {
  it("renders without hydrate errors and emits the trigger ARIA state", async () => {
    const { html, diagnostics } = await renderToString(
      `<appkit-dropdown-menu items-json='[{"id":"a","label":"A"}]'><button slot="trigger">Open</button></appkit-dropdown-menu>
       <appkit-popover open><button slot="trigger">Info</button>Body</appkit-popover>`,
    )
    expect(diagnostics.filter(d => d.level === "error")).toEqual([])
    const doc = new DOMParser().parseFromString(html, "text/html")
    const menuTrigger = doc.querySelector("appkit-dropdown-menu > [slot=trigger]")
    const popoverTrigger = doc.querySelector("appkit-popover > [slot=trigger]")
    expect(menuTrigger?.getAttribute("aria-haspopup")).toBe("menu")
    expect(menuTrigger?.getAttribute("aria-expanded")).toBe("false")
    expect(popoverTrigger?.getAttribute("aria-haspopup")).toBe("dialog")
    expect(popoverTrigger?.getAttribute("aria-expanded")).toBe("true")
  })
})
