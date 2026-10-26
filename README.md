# connect-suite

Monorepo for the Naculus Connect SDKs. It holds two release groups that
share one lockfile and one CI:

| Group | Path | Packages | What it is |
|---|---|---|---|
| lib | `packages/lib/packages/*` | `@naculus/connect-core`, `@naculus/connector-*`, `@naculus/wallet-engine`, `@naculus/siwx`, `@naculus/payments-*`, `@naculus/connect` | Framework-agnostic connection, authorization, and payment logic |
| appkit | `packages/appkit/packages/*` | `@naculus/connect-appkit-{core,react,vue,ui,wc}`, `@naculus/connect-native` | React, Vue, web component, and React Native UI on top of lib |

Each group releases in lockstep: every public package in a group shares one
version. Groups release independently, each with its own tag prefix
(`lib/v<version>`, `appkit/v<version>`).

## Development

Requirements: Node 22 and pnpm 11.1.2.

```sh
pnpm install --frozen-lockfile
pnpm run build          # build both groups
pnpm run test:run       # tests for both groups
pnpm run typecheck
pnpm run lint
pnpm run test:matrix    # cross-package dependency matrix (packs and installs each package)
```

Each group also has its own scripts, for example `pnpm --dir packages/lib exec vitest run`.
See the group READMEs and `docs/` for architecture, security notes, and migration guides:

- [lib README](packages/lib/README.md)
- [appkit README](packages/appkit/README.md)
- [Security audit exceptions](docs/security/AUDIT-EXCEPTIONS.md)

## Releases

Releases are cut by the Publish workflow for each group, not by hand.
Before anything reaches npm, each group's release preflight checks that the
version is coherent across its packages, that the version is not yet on the
registry, and that the matching tag does not exist.

## License

MIT. See [LICENSE](LICENSE).
