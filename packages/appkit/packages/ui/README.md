# @naculus/connect-appkit-ui

**Naculus Connect UI — shared design tokens, base CSS, and legacy shadcn context.** Import this for the visual foundation; all framework packages depend on these styles.

> **🔗 Shared styles consumed by `@naculus/connect-appkit-wc`. Install this directly only if you need the tokens standalone.**

| Framework | Package |
|-----------|---------|
| Web Components (base) | `@naculus/connect-appkit-wc` |
| React | `@naculus/connect-appkit-react` |
| Vue | `@naculus/connect-appkit-vue` |
| **UI** (shared styles) | `@naculus/connect-appkit-ui` |

All four packages are released together on one version; install the same version of each.

## Install

```bash
npm install @naculus/connect-appkit-ui
# or
pnpm add @naculus/connect-appkit-ui
```

## Component styles

Import the complete token, base, and component stylesheet once:

```ts
import "@naculus/connect-appkit-ui/styles"
```

No Tailwind setup is required in the consuming app. Add the `dark` class to an
ancestor of the UI to use the dark theme.

The component stylesheet also handles foldable and dual-screen spanning. When
a browser exposes two viewport segments, payment cards and dialogs stay in the
first segment instead of centering across a hinge; vertically segmented screens
keep those surfaces above the fold. These rules use viewport-segment media
features and have no effect at ordinary single-screen viewport sizes.

The components assume a page reset (Tailwind preflight, as shadcn components
do). An app that already uses Tailwind has one. Otherwise also import the
opt-in reset, which changes element defaults for the whole page:

```ts
import "@naculus/connect-appkit-ui/styles/preflight"
```

## License

MIT
