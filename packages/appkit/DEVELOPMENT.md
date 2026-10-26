# Development Guide

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Setup

```bash
pnpm install
```

## Workspace

```
connect-appkit/          # Monorepo root
├─ packages/
│  ├─ react/             @naculus/connect-appkit-react
│  ├─ ui/                @naculus/connect-appkit-ui
│  ├─ vanilla/           @naculus/connect-appkit-vanilla (Web Components)
│  └─ vue/               @naculus/connect-appkit-vue
├─ .storybook/           Storybook config
└─ test-utils/           Shared test utilities
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm test:run` | Run all tests |
| `pnpm storybook` | Start Storybook on :61000 |
| `pnpm build` | Build all packages |

## Git Workflow

- `dev` — integration branch, push all work here
- `master` — releases only, requires version bump + tag
- No direct commits to master; merge from dev

## Adding a shadcn component

```bash
cd packages/ui
npx shadcn@latest add <component>
```

Then fix import paths: shadcn generates `src/lib/cn` → replace with `../../lib/cn`.

## Storybook

Stories live next to components as `*.stories.tsx` (CSF format).
Global decorator in `.storybook/preview.tsx` provides Web3ComponentProvider.
Run `pnpm storybook` then open http://localhost:61000.

## Publishing

Each package uses `changeset` for versioning.
CI publishes via GitHub Actions (OIDC trusted publisher).
