# @naculus/connect-ui — Theme & Design System

## CSS Variable Contract

`@naculus/connect-ui` uses **CSS custom properties** for all visual styling.
This enables framework-agnostic theming — works with React, Vue, Svelte, or vanilla HTML.

All components read from these CSS variables at runtime via `hsl()` color space.
No Tailwind dependency at the component level.

### shadcn-compatible variables

| Variable | Fallback | Description |
|---|---|---|
| `--background` | `0 0% 100%` | Page background |
| `--foreground` | `222.2 84% 4.9%` | Text color |
| `--card` | `0 0% 100%` | Card/surface background |
| `--card-foreground` | `222.2 84% 4.9%` | Card text |
| `--primary` | `221.2 83.2% 53.3%` | Primary action color |
| `--primary-foreground` | `210 40% 98%` | Primary text on primary bg |
| `--secondary` | `210 40% 96.1%` | Secondary action |
| `--muted` | `210 40% 96.1%` | Muted background |
| `--muted-foreground` | `215.4 16.3% 46.9%` | Muted text |
| `--border` | `214.3 31.8% 91.4%` | Border color |
| `--input` | `214.3 31.8% 91.4%` | Input border |
| `--ring` | `221.2 83.2% 53.3%` | Focus ring |
| `--radius` | `0.5rem` | Border radius |

### Extended design tokens (`@naculus/connect-ui/styles/tokens`)

| Variable | Example | Description |
|---|---|---|
| `--w3c-space-{1..16}` | `4px` to `64px` | Spacing scale (4px grid) |
| `--w3c-font-sans` | `system-ui, …` | Sans-serif font stack |
| `--w3c-font-mono` | `'SF Mono', …` | Monospace font stack |
| `--w3c-font-size-{xs..2xl}` | `12px` to `24px` | Type scale |
| `--w3c-radius-{sm..full}` | `6px` to `9999px` | Border radius scale |
| `--w3c-shadow-{sm..2xl}` | | Box shadow scale |
| `--w3c-duration-{fast..slow}` | `150ms` to `300ms` | Transition duration |
| `--w3c-ease-{out,in,in-out}` | | Timing functions |
| `--w3c-z-{dropdown..toast}` | `100` to `500` | Z-index scale |
| `--w3c-modal-width-{sm..lg}` | `360px` to `512px` | Modal width presets |

## Usage

### With Tailwind CSS

```css
/* app.css */
@import "tailwindcss";
@import "@naculus/connect-ui/styles";
```

Tailwind's `bg-card`, `text-foreground`, etc. work automatically
because `utilities.css` defines those classes via the same CSS variables.

### Without Tailwind (any framework)

```css
/* app.css */
@import "@naculus/connect-ui/styles";
```

Then use the utility classes directly:

```html
<div class="bg-card text-foreground border-border rounded-xl p-6 shadow-lg">
  <button class="bg-primary text-primary-foreground rounded-lg px-4 py-2">
    Connect Wallet
  </button>
</div>
```

### Framework-agnostic CSS import

```js
// React / Vue / Svelte
import "@naculus/connect-ui/styles"

// Or individual layers:
import "@naculus/connect-ui/styles/tokens"   // design tokens only
import "@naculus/connect-ui/styles/utilities" // utility classes only
```

### Custom theme

Override any variable in your `:root`:

```css
:root {
  --primary: 175 50% 45%;
  --background: 156 30% 96%;
  --border: 190 25% 85%;
}
```

### Dark mode

Add class `dark` to `<html>`:

```html
<html class="dark">
```

Or use `ThemeProvider` from `@naculus/connect-react`:

```tsx
import { ThemeProvider } from "@naculus/connect-react"

<ThemeProvider defaultDark priority="fallback">
  <App />
</ThemeProvider>
```

## Component Registry

All UI components can be overridden via `Web3ComponentProvider`:

```tsx
import { Web3ComponentProvider, Button } from "@naculus/connect-ui"

<Web3ComponentProvider components={{ Button: MyCustomButton }}>
  <ConnectButton />
</Web3ComponentProvider>
```

## File Structure

```
styles/
├── index.css       # Full design system (tokens + utilities)
├── tokens.css      # Design tokens only (CSS variables)
└── utilities.css   # Utility classes (Tailwind-compatible, framework-agnostic)
```
