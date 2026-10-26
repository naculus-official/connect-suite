# @naculus/connect-appkit

React/Vue/Vanilla UI components and hooks for the @naculus/connect Web3 SDK.

## Positioning

```
naculus/
├── connect-lib/       ← Pure library (framework-agnostic)
└── connect-appkit/    ← You are here: framework-specific UI
```

## Packages

| Package | Description |
|---------|-------------|
| `@naculus/connect-appkit-react` | React hooks + providers + components |
| `@naculus/connect-appkit-ui` | shadcn UI components + ComponentRegistry |
| `@naculus/connect-appkit-wc` | Web Components (`<appkit-button>`) |
| `@naculus/connect-appkit-vue` | Vue wrappers |

## Quick start

```sh
pnpm install
pnpm build
pnpm storybook          # http://localhost:61000
pnpm test:run
```

## Docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup, commands, conventions
- [docs/api.md](./docs/api.md) — API reference

## License

MIT
