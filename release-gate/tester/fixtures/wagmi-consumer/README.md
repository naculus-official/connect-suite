# wagmi consumer fixture

A minimal, standalone consumer that installs **the real `wagmi`** and builds
`@naculus/connector-wagmi` from a packed tarball.

## Why it is separate from Gate 2

The main Gate 2 consumer (the tester root) deliberately does **not** install
`wagmi`. That is what lets it observe the failure mode a consumer hits when the
optional peer is missing. Adding `wagmi` there would erase that signal.

This fixture covers the opposite case — the supported path — with its own
`package.json`, its own `pnpm-lock.yaml` and its own `node_modules`. The tester
root's dependency set is untouched.

The isolation is structural: the parent `pnpm-workspace.yaml` has no `packages:`
key, so nothing under `fixtures/` is absorbed into its workspace.

## What it proves, and how the two results differ

| check | finding | fails when |
|---|---|---|
| `pnpm exec vite build` | **B9** | `connector-wagmi` value-imports `ChainNotConfiguredError` / `SwitchChainNotSupportedError` from `wagmi` while `wagmi` is an *optional* peer. Absent the package, the bundler substitutes a stub, the named bindings do not exist, and Rollup fails with `MISSING_EXPORT`. |
| `pnpm exec tsc --noEmit` | **B4** | `connector-wagmi` declares `"types": "./dist/index.d.ts"` but builds with `dts: false`. The file it points at is never emitted, so `TS7016: Could not find a declaration file` fires on the import. |

**These fail independently. A build failure is B9; a typecheck failure is B4.
Do not report one as the other.**

Expected results by repair state:

| state | `tsc --noEmit` | `vite build` |
|---|---|---|
| before B9 and B4 | fails (B4) | fails (B9) |
| after B9, before B4 | fails (B4) | **passes** |
| after B9 and B4 | **passes** | **passes** |

### Currently observed — after B9, before B4

`vite build` → **exit 0**, `✓ 2174 modules transformed`, `dist/assets/index-*.js 538.70 kB`.

`tsc --noEmit` → **exit 2**, two errors:

```
src/main.ts(24,40): error TS7016: Could not find a declaration file for module
  '@naculus/connector-wagmi'. '.../dist/index.js' implicitly has an 'any' type.
src/main.ts(49,42): error TS7006: Parameter 'c' implicitly has an 'any' type.
```

The second is a consequence of the first, not a separate defect: with
`createNaculusConnector` typed as `any`, the generic on `createConfig` collapses,
so `config.connectors` degrades to `any` and the `.map((c) => c.type)` callback
parameter loses its inferred type. Both should disappear together when B4 lands.
Neither is annotated away — an explicit `any` here would suppress exactly the
signal the fixture is meant to carry.

`vite build` also emits a warning unrelated to B9 and B4:

```
Module "crypto" has been externalized for browser compatibility,
  imported by ".../@naculus/connect-core/dist/index.js"
```

`connect-core` inlines `@noble/hashes` via `noExternal`, and tsup's default
`platform: "node"` selects noble's Node conditional export, leaving a bare
`import ... from "crypto"` in the published ESM bundle. Tracked separately;
this fixture is a second independent reproduction of it.

## Rules

- Only `file:` tarballs from `../../artifacts/`. Never a `src` alias, a
  `tsconfig` `paths` entry, or a workspace link.
- No stub, mock, `resolve.alias`, or `optimizeDeps.exclude`. A workaround that
  turns the build green would assert something untrue about real consumers.
- `wagmi`, `viem`, `@tanstack/react-query`, `react` and `react-dom` are real
  packages from the registry, at the versions a consumer would install.
- `pnpm-workspace.yaml` must carry `overrides` for every `@naculus/*` package.
  `pnpm pack` rewrites `workspace:*` into a fixed version, so without them the
  transitive `@naculus/*` dependencies resolve from the public registry and the
  fixture silently validates published code instead of the tarball under test.

## Usage

```bash
# from the tester root — repacks the SDK, then runs this fixture
pnpm gate:fixture:wagmi

# or directly
cd fixtures/wagmi-consumer
pnpm install --force      # --force: pnpm caches file: tarballs by path
pnpm verify               # tsc --noEmit && vite build
```

`--force` is not optional. pnpm keys `file:` tarballs by path, so a freshly
packed tarball written to the same filename is ignored without it, and the
fixture would re-validate the previous build.

## Cleanup

```bash
rm -rf fixtures/wagmi-consumer/node_modules fixtures/wagmi-consumer/dist
```

`pnpm-lock.yaml` is committed on purpose: the fixture's value lies in being a
reproducible consumer environment, and a floating dependency tree would make
failures hard to attribute.

## Not in scope

No Playwright, no runtime browser assertion, no wallet connection, no mocked
provider. Typecheck and production build only. `createConfig` merely assembles
configuration and `http()` opens no socket until a request is made — none is.
