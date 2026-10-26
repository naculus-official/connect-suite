/// <reference types="vitest" />
/// @vitest-environment jsdom

// Keyboard and ARIA behavior of appkit-dropdown-menu (WAI-ARIA Menu Button)
// and appkit-popover (disclosure of a dialog), against the built custom
// elements. Run `pnpm --filter @naculus/connect-appkit-wc build` first.

import { describe, it, expect, afterEach } from "vitest"
import "@naculus/connect-appkit-wc/dist/components/appkit-dropdown-menu.js"
import "@naculus/connect-appkit-wc/dist/components/appkit-popover.js"

/** Stencil renders asynchronously and opening waits two animation frames. */
const settle = () => new Promise(r => setTimeout(r, 50))

const key = (target: Element, k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

/** The focused element, looking through the component's shadow root. */
const focused = (host: Element) => host.shadowRoot?.activeElement ?? document.activeElement

afterEach(() => { document.body.innerHTML = "" })

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "s1", label: "", separator: true },
  { id: "b", label: "Bravo", disabled: true },
  { id: "c", label: "Charlie" },
  { id: "s2", label: "", separator: true },
  { id: "d", label: "Delta" },
]

async function mountMenu(items: unknown[] = ITEMS) {
  document.body.innerHTML = `
    <input id="outside" />
    <appkit-dropdown-menu><button id="trigger" slot="trigger">Open</button></appkit-dropdown-menu>`
  const menu = document.querySelector("appkit-dropdown-menu") as HTMLElement & { itemsJson: string }
  menu.itemsJson = JSON.stringify(items)
  await settle()
  const trigger = document.getElementById("trigger") as HTMLButtonElement
  const label = (el: Element | null | undefined) => el?.textContent
  return { menu, trigger, label }
}

async function openMenu(menu: HTMLElement, trigger: HTMLButtonElement) {
  trigger.focus()
  trigger.click()
  await settle()
  return menu.shadowRoot!.querySelector("[role=menu]") as HTMLElement
}

describe("appkit-dropdown-menu", () => {
  it("puts aria-haspopup / aria-expanded on the slotted trigger, not the wrapper", async () => {
    const { menu, trigger } = await mountMenu()
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(menu.shadowRoot!.querySelector("[aria-expanded], [aria-haspopup]")).toBeNull()

    await openMenu(menu, trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    key(focused(menu)!, "Escape")
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("leaves Enter / Space on the closed trigger to the button", async () => {
    const { trigger } = await mountMenu()
    expect(key(trigger, "Enter").defaultPrevented).toBe(false)
    expect(key(trigger, " ").defaultPrevented).toBe(false)
  })

  it("moves real focus to the first item on open", async () => {
    const { menu, trigger, label } = await mountMenu()
    const list = await openMenu(menu, trigger)
    expect(list.classList.contains("open")).toBe(true)
    expect(label(focused(menu))).toBe("Alpha")
  })

  it("keeps menu items out of the Tab sequence", async () => {
    const { menu, trigger } = await mountMenu()
    await openMenu(menu, trigger)
    for (const item of menu.shadowRoot!.querySelectorAll("[role=menuitem]")) {
      expect(item.getAttribute("tabindex")).toBe("-1")
    }
  })

  it("ArrowDown / ArrowUp move real focus, skipping separators and disabled items", async () => {
    const { menu, trigger, label } = await mountMenu()
    await openMenu(menu, trigger)

    const steps: Array<[string, string]> = [
      ["ArrowDown", "Charlie"], // skips the separator and disabled Bravo
      ["ArrowDown", "Delta"],   // skips the second separator
      ["ArrowDown", "Delta"],   // stays on the last item
      ["ArrowUp", "Charlie"],
      ["ArrowUp", "Alpha"],
      ["ArrowUp", "Alpha"],     // stays on the first item
    ]
    for (const [k, expected] of steps) {
      const e = key(focused(menu)!, k)
      await settle()
      expect(e.defaultPrevented).toBe(true)
      expect(label(focused(menu))).toBe(expected)
      expect(label(menu.shadowRoot!.querySelector(".item.focused"))).toBe(expected)
    }
  })

  it("Home / End jump to the first and last enabled item", async () => {
    const { menu, trigger, label } = await mountMenu([
      { id: "x", label: "Off", disabled: true },
      ...ITEMS,
      { id: "y", label: "Off too", disabled: true },
    ])
    await openMenu(menu, trigger)
    key(focused(menu)!, "End")
    await settle()
    expect(label(focused(menu))).toBe("Delta")
    key(focused(menu)!, "Home")
    await settle()
    expect(label(focused(menu))).toBe("Alpha")
  })

  it("ArrowDown / ArrowUp on the closed trigger open and focus the first / last item", async () => {
    const { menu, trigger, label } = await mountMenu()
    trigger.focus()
    key(trigger, "ArrowUp")
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(label(focused(menu))).toBe("Delta")

    key(focused(menu)!, "Escape")
    await settle()
    key(trigger, "ArrowDown")
    await settle()
    expect(label(focused(menu))).toBe("Alpha")
  })

  it("Escape closes and returns focus to the trigger", async () => {
    const { menu, trigger } = await mountMenu()
    const list = await openMenu(menu, trigger)
    key(focused(menu)!, "ArrowDown")
    await settle()
    key(focused(menu)!, "Escape")
    await settle()
    expect(list.classList.contains("open")).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it("selecting an item emits appkitSelect, closes and returns focus to the trigger", async () => {
    const { menu, trigger } = await mountMenu()
    const list = await openMenu(menu, trigger)
    const selected: string[] = []
    menu.addEventListener("appkitSelect", e => selected.push((e as CustomEvent<string>).detail))
    key(focused(menu)!, "ArrowDown")
    await settle();
    (focused(menu) as HTMLElement).click()
    await settle()
    expect(selected).toEqual(["c"])
    expect(list.classList.contains("open")).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it("an outside click closes without stealing focus", async () => {
    const { menu, trigger } = await mountMenu()
    const list = await openMenu(menu, trigger)
    const outside = document.getElementById("outside") as HTMLInputElement
    outside.focus()
    outside.click()
    await settle()
    expect(list.classList.contains("open")).toBe(false)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(outside)
  })

  it("moves the ARIA state to a replacement trigger", async () => {
    const { menu, trigger } = await mountMenu()
    const next = document.createElement("button")
    next.slot = "trigger"
    trigger.replaceWith(next)
    await settle()
    // jsdom does not fire slotchange; a re-render syncs as well.
    menu.itemsJson = "[]"
    await settle()
    expect(next.getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger.hasAttribute("aria-haspopup")).toBe(false)
  })
})

async function mountPopover() {
  document.body.innerHTML = `
    <input id="outside" />
    <appkit-popover>
      <button id="trigger" slot="trigger">Info</button>
      <button id="inside">Inside</button>
    </appkit-popover>`
  await settle()
  const popover = document.querySelector("appkit-popover") as HTMLElement & { open: boolean }
  const trigger = document.getElementById("trigger") as HTMLButtonElement
  const panel = popover.shadowRoot!.querySelector("[role=dialog]") as HTMLElement
  return { popover, trigger, panel }
}

describe("appkit-popover", () => {
  it("puts aria-haspopup / aria-expanded on the slotted trigger, not the wrapper", async () => {
    const { popover, trigger } = await mountPopover()
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(popover.shadowRoot!.querySelector("[aria-expanded], [aria-haspopup]")).toBeNull()

    trigger.click()
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    trigger.click()
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("reflects the controlled `open` prop on the trigger", async () => {
    const { popover, trigger } = await mountPopover()
    popover.open = true
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("Escape closes and returns focus to the trigger", async () => {
    const { popover, trigger, panel } = await mountPopover()
    trigger.click()
    await settle()
    const inside = document.getElementById("inside") as HTMLButtonElement
    inside.focus()
    key(inside, "Escape")
    await settle()
    expect(panel.classList.contains("open")).toBe(false)
    expect(popover.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it("Escape pressed elsewhere closes but leaves focus where it is", async () => {
    const { trigger, panel } = await mountPopover()
    trigger.click()
    await settle()
    const outside = document.getElementById("outside") as HTMLInputElement
    outside.focus()
    key(outside, "Escape")
    await settle()
    expect(panel.classList.contains("open")).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it("an outside click closes without stealing focus", async () => {
    const { trigger, panel } = await mountPopover()
    trigger.click()
    await settle()
    const outside = document.getElementById("outside") as HTMLInputElement
    outside.focus()
    outside.click()
    await settle()
    expect(panel.classList.contains("open")).toBe(false)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(outside)
  })
})
