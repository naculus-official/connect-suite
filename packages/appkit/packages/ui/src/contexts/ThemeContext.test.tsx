/// <reference types="vitest" />
/// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"

afterEach(() => cleanup())
import { ThemeProvider, useTheme, useThemeVariable } from "./ThemeContext"
import { THEME_CONTRACT } from "../lib/css-variables"

// A helper component to test hooks
function TestConsumer() {
  const { theme, isDark, setTheme, toggleDarkMode } = useTheme()
  return (
    <div>
      <div data-testid="is-dark">{String(isDark)}</div>
      <div data-testid="theme-length">{Object.keys(theme).length}</div>
      <button type="button" data-testid="set-theme" onClick={() => setTheme({ primary: "#ff0000" })}>
        Set Theme
      </button>
      <button type="button" data-testid="toggle-dark" onClick={toggleDarkMode}>
        Toggle Dark
      </button>
    </div>
  )
}

/** Helper: read a CSS custom property via getComputedStyle (works with <style> tag) */
function getCSSVar(name: keyof typeof THEME_CONTRACT): string {
  const cssVar = THEME_CONTRACT[name]
  if (!cssVar) return ""
  return getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar.name)
    .trim()
}

function VariableReader() {
  const primary = useThemeVariable("primary")
  return <div data-testid="var-value">{primary}</div>
}

describe("ThemeContext", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark")
    // Remove any injected theme <style> tags from previous tests
    document.querySelectorAll('style[id^="w3c-theme-"]').forEach(el => el.remove())
  })

  it("provides default values when no theme is given", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId("is-dark").textContent).toBe("false")
    expect(screen.getByTestId("theme-length").textContent).toBe("0")
  })

  it("applies initial theme CSS variables via <style> tag", () => {
    render(
      <ThemeProvider theme={{ primary: "#3b82f6" }}>
        <TestConsumer />
      </ThemeProvider>
    )
    expect(getCSSVar("primary")).toBe("#3b82f6")
  })

  it("drops theme values that could inject CSS", () => {
    render(
      <ThemeProvider
        theme={{
          primary: "red; } body { display: none",
          background: "\\7b",
          foreground: "#111111",
        }}
      >
        <TestConsumer />
      </ThemeProvider>
    )
    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n")
    expect(css).not.toContain("display: none")
    expect(css).not.toContain("\\7b")
    expect(getCSSVar("foreground")).toBe("#111111")
  })

  it("applies dark mode class when defaultDark is true", () => {
    render(
      <ThemeProvider defaultDark={true}>
        <TestConsumer />
      </ThemeProvider>
    )
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("toggles dark mode via toggleDarkMode", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )
    expect(document.documentElement.classList.contains("dark")).toBe(false)

    fireEvent.click(screen.getByTestId("toggle-dark"))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(screen.getByTestId("is-dark").textContent).toBe("true")

    fireEvent.click(screen.getByTestId("toggle-dark"))
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(screen.getByTestId("is-dark").textContent).toBe("false")
  })

  it("removes CSS variables on unmount", () => {
    const { unmount } = render(
      <ThemeProvider theme={{ primary: "#ff0000" }}>
        <TestConsumer />
      </ThemeProvider>
    )

    // Style tag is present and CSS var is defined
    const styleTags = document.querySelectorAll('style[id^="w3c-theme-"]')
    expect(styleTags.length).toBe(1)
    expect(getCSSVar("primary")).toBe("#ff0000")

    unmount()

    // After unmount, the <style> tag is removed and var falls back to default
    const remaining = document.querySelectorAll('style[id^="w3c-theme-"]')
    expect(remaining.length).toBe(0)
  })

  it("setTheme updates the theme and re-renders <style> tag", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    act(() => {
      fireEvent.click(screen.getByTestId("set-theme"))
    })

    expect(getCSSVar("primary")).toBe("#ff0000")
  })

  it("useThemeVariable reads from theme context", () => {
    render(
      <ThemeProvider theme={{ primary: "#00ff00" }}>
        <VariableReader />
      </ThemeProvider>
    )

    expect(screen.getByTestId("var-value").textContent).toBe("#00ff00")
  })
})
