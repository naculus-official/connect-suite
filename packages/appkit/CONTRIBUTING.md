# Contributing

0. **File an issue** or pick one with `help wanted` label.
1. **Fork → branch** — short-lived feature branches, one concern per branch.
2. **PR against main** — title prefixed with the package scope, e.g. `react: fix useWallet race condition` or `ui: add TokenSelector empty state`.
3. **Add a changeset** — `pnpm changeset` before pushing, describe what changed and the bump level (`patch`/`minor`/`major`). CI checks it.
4. **Review** — automated checks must pass. Manual review by a maintainer.
5. **Merge** — squash merge.

## Packages

```
connect-react/
├── packages/react/   # @naculus/connect-react — hooks + useWeb3 provider
└── packages/ui/      # @naculus/connect-ui — components + theme
```

## Code conventions

- Follow Biome rules (`pnpm lint` passes clean).
- New code needs a test if it would break under unexpected input.
- **Ponytail philosophy** — simplest implementation that works, with documented limits. Don't add abstractions before they have a second consumer.
- All colors via CSS variables — no raw hex in className (except status indicator `#22c55e`).
- Spacing: 4px grid. Font sizes: xs/sm/base/lg/xl/2xl only.
- Icons: `lucide-react` only. No emoji or unicode icons.
- No `!important`, no inline styles, no `dark:` modifiers in components (CSS variables handle theming).
- Hardcoded RPC URLs, chain IDs, or address strings → move to the relevant `constants.ts`.

## Changesets

### Every PR with API/behavior changes

```sh
pnpm changeset          # pick packages, describe change, choose patch/minor/major
```

This creates a `patch/my-description.md` in `.changeset/`. Commit it with the PR.

### When cutting a release (maintainer)

```sh
pnpm changeset version          # consume all pending changesets, bump package versions
git add -A && git commit -m "vX.Y.Z"
git tag vX.Y.Z
git push origin vX.Y.Z
pnpm build                      # build all packages
pnpm publish -r                 # publish to npm (each package in topological order)
```

## Tests

```sh
pnpm test:run       # vitest run (all tests)
pnpm test           # vitest (watch mode)
pnpm tsc --noEmit   # type check
```

Component stories via Storybook:

```sh
pnpm storybook          # Start Storybook at localhost:61000
pnpm build-storybook    # Build static Storybook
```

## Releasing

```sh
pnpm publish:local       # Publish to local verdaccio (http://localhost:4873)
pnpm publish:npm         # Publish to npm registry
```

Ensure `connect-lib` packages are published to their target registry first.
