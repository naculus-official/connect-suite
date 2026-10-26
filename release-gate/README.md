# Release Gate

Verifies that `connect-lib` and `connect-appkit` are **consumable as published
artifacts**, not merely that their sources typecheck.

## The rule this exists to enforce

Both SDK repos test their own sources. `connect-lib/vitest.config.ts` maps every
`@naculus/*` specifier back to `packages/*/src`, and `connect-appkit` does the
same through `test-utils/aliases`. Nothing in either repo ever loads a built
`dist/`. As a result an entire class of defect — missing type declarations,
unreachable export conditions, un-emitted worker assets, Node-only globals left
in browser code, third-party libraries silently inlined — is invisible to CI and
only surfaces after publish.

> **This tester must never alias `@naculus/*` to a sibling repo's `src/`.**
> Not in `vite.config.ts`, not in `tsconfig.json` `paths`, not in a
> `pnpm.overrides` link. Doing so re-creates exactly the blind spot the gate
> exists to close. Consume tarballs, or consume nothing.

## Layout

```
release-gate/
  pack.mjs               build both repos and pnpm pack every public package
  gate1-artifacts.mjs    static checks over the resulting .tgz files
  declared-ranges.mjs    verify declared SDK ranges and a plain npm install
  lib/tar.mjs            zero-dependency tarball reader
  lib/fingerprints.mjs   byte patterns used to detect inlined code
artifacts/               generated, gitignored
```

`gate1-artifacts.mjs` deliberately has **no npm dependencies**. It has to run
before `pnpm install` and it has to be able to open a tarball produced by a repo
whose dependencies are broken.

## Usage

```bash
pnpm gate:pack     # build + pack both SDK repos into ./artifacts
pnpm gate:1        # run the artifact checks
pnpm gate:ranges   # check declared ranges without pnpm overrides
pnpm gate          # both
```

Useful flags while iterating:

```bash
node release-gate/pack.mjs --skip-build           # reuse existing dist/
node release-gate/pack.mjs --only=connect-lib     # one repo (composes with the appkit pack)
node release-gate/gate1-artifacts.mjs some/dir    # alternate artifact dir
```

Exit code is `1` if any check fails, so it drops into CI unchanged.

`gate:ranges` first checks every `@naculus/*` dependency, peer, and optional
dependency declared by the packed appkit manifests against the matching packed
version. It then installs every packed SDK tarball with plain npm in a fresh
temporary directory, without a workspace, overrides, or an existing lockfile.
The resulting lockfile must contain exactly one copy of every `@naculus/*`
package, and every copy must resolve from the supplied local tarballs. The
temporary consumer is removed after either success or failure.

## Checks

| Check | Fails when | Why it matters |
|---|---|---|
| `entry-points-resolve` | a path in `main`/`module`/`types`/`exports` is absent from the tarball | consumers get a resolution error or `Could not find a declaration file` |
| `cjs-reachable` | `.cjs` files ship but no `require` condition routes to them | dead bytes; and on Node < 22.12 `require()` throws `ERR_REQUIRE_ESM` |
| `browser-safe` *(warning)* | ESM output references `process.env`, `require()`, `__dirname`, `__filename` | portability: the artifact only loads where the consumer's bundler shims `process`. See "Why B2 is not listed here" — reported, never fatal |
| `no-inlined-workspace` | a declared `@naculus/*` dependency was bundled in rather than imported | duplicate module state — two `ConnectorManager` registries, two nonce stores |
| `no-vendored-crypto` | `bs58`/`tweetnacl`/`ripple-keypairs` appear in the bundle at all | a vendored copy can never be patched by a version bump, a `pnpm.overrides` entry, or `pnpm audit`. **Declaring the library as a dependency does not clear this** — a copy that is both declared and bundled is exactly as unpatchable, and the declaration only makes it harder to notice, because the manifest starts saying the right thing while the bytes still say the wrong one. The declaration is reported in the diagnostic, never used to skip the scan |
| `framework-neutral` | a `-wc`/`-vue`/`-loader` package depends on React (or a React-only package) | vanilla and Vue consumers should not install React |
| `no-publish-leak` | `src/`, tests, stories or build configs are inside the tarball | usually means `files` or `exports` is missing |
| `umbrella-non-empty` | `@naculus/connect`'s entry exports nothing | the headline install target is unusable |
| `worker-emitted` | a `new URL('./x.js', import.meta.url)` target is not in the tarball | the Worker 404s at runtime; unreachable from `environment: "node"` tests |
| `worker-browser-resolvable` | a Worker asset imports a specifier a browser worker cannot resolve — a bare package name, or `node:` | a module worker has no bundler and no import map. Emitting the file without bundling its dependencies turns a 404 into a module resolution error: same broken feature, different symptom. Relative and URL imports are allowed; this is not "zero imports" |
| `worker-no-node-globals` | a Worker asset reads `process.`, `globalThis.process`, `require(`, `__dirname` or `__filename` | `browser-safe` flags the same patterns across the tarball but only warns, because a consumer's bundler normally shims `process` — Gate 2 confirmed Vite does. **A module worker is loaded straight from a URL by `new Worker()`, outside any bundler, so nothing shims it there.** Same pattern, different consequence: it fails here. Scoped to worker assets only — `dist/index.js` is not checked at this severity |
| `sourcemap-weight` | maps exceed 3x the code they describe (warning only) | `sourcemap: true` inlines `sourcesContent`, so the map carries a full source copy |

`@naculus/connect` is the headline convenience package. It re-exports the core
API and exposes connector packages as namespaces, so an empty root entrypoint is
always a release failure.

## Adding a fingerprint

`lib/fingerprints.mjs` holds byte patterns, not heuristics. Before adding one,
verify against real output that it (a) appears in the package you want to
detect and (b) appears in **no** other package:

```bash
grep -c 'YOUR_MARKER' ../connect-lib/packages/*/dist/index.js
```

Minification mangles identifiers but preserves string literals, so prefer error
messages and alphabets over function names. The `bs58` entry documents a
concrete false positive that caught us: `connect-core` hand-rolls base58 in
`resolver/providers/sns.ts`, so the base58 alphabet alone is not evidence of a
vendored `bs58` — the `base-x` error strings are.

The three fingerprints are deliberately not the whole story. When `@naculus/siwx`
inlined them, it dragged in six more packages that no fingerprint covers —
`base-x`, `ripple-address-codec`, `@xrplf/isomorphic`, `@scure/base`,
`@noble/hashes` and `@noble/curves` — 421 KB of third-party source against 49 KB
of its own. Two of those, `@noble/hashes` and `@noble/curves`, are pinned by
`overrides` in connect-lib's own `pnpm-workspace.yaml`, which is precisely the
mechanism a bundled copy defeats. Three markers were enough to catch it because
they sat at the root of the import graph; do not read a green check as proof
that nothing else is inlined.

---

# Gate 2 — browser import smoke

Imports every packed artifact in a real Chromium, once through the Vite dev
server and once through a production build served by `vite preview`.

```bash
pnpm gate:install   # steady-state only; referenced artifacts must already exist
node release-gate/version-transition-install.mjs
                      # official version-transition installer after pack
pnpm gate:2         # dev leg + production build + preview leg
```

## Why a real browser

Node has `process`, `require` and the node: builtins; a browser has none of
them. Running these imports under `vitest` with `environment: "node"` — or even
`jsdom`, which is still Node underneath — cannot tell you whether an artifact
loads in a browser. Neither can SSR: TanStack Start renders routes in Node
first, so `/gate` does all of its importing inside a client-side effect.

## Resolution rules — all four are load-bearing

**1. `overrides` must live in `pnpm-workspace.yaml`.** As of pnpm 11.20 the
`pnpm` key in `package.json` is no longer read. Putting `overrides` there fails
*silently* — the only signal is `[WARN] The "pnpm" field in package.json is no
longer read by pnpm`, which is easy to scroll past. While it sat in the wrong
place, the umbrella's transitive dependencies resolved from the public npm
registry and the gate was quietly testing published code instead of the local
build. `gate:install` writes to `pnpm-workspace.yaml`; `package.json` carries no
`pnpm` key at all, so there is exactly one source of truth.

**2. Every `@naculus/*` in the tree — direct *and* transitive — must resolve to
`artifacts/*.tgz`.** `pnpm pack` rewrites `workspace:*` into a fixed version, so
`@naculus/connect` ships declaring `"@naculus/connect-core": "0.1.6"`. Without a
root-level override that specifier resolves from the registry. Verify with:

```bash
grep -cE "^  '@naculus/[a-z-]+@[0-9]" pnpm-lock.yaml   # must print 0
```

Anything above zero means part of the tree came from npm and the run is void.

**3. `gate:install` always installs with `--force`.** pnpm caches `file:`
tarballs by path, so a freshly packed tarball written to the same path is
ignored without it — the gate would silently re-test the previous build.

**4. Provenance verification is a gate, not a formality.** `gate:2` SHA-256s
each installed entry point against the same file inside its tarball and aborts
before launching a browser on any mismatch. This must never be relaxed into
"trust the config": rules 1–3 are all configuration, and rule 1 already failed
silently once. Bytes are the only check that cannot lie.

This override block belongs to the tester alone. **Never copy it into
`connect-lib` or `connect-appkit`** — pointing an SDK repo at local tarballs
would defeat the separation the gate exists to enforce.

## Expectations

`expectations.json` classifies each failure:

| verdict | meaning |
|---|---|
| `KNOWN` | listed in `expectations.json` with a matching code — reported, does not fail the gate |
| `FAIL` | not listed, or listed with a different code — a regression, fails the gate |
| `FIXED` | listed but now passing — update `expectations.json` by hand; the runner never edits it |
| `SKIP` | not exercised in this leg |

A `finding` of `missing-peer-by-design` marks a failure that is intended and
permanent. It pins down a consumer-visible behaviour rather than tracking a
defect awaiting repair, and it never becomes `FIXED`.

### Why B2 is not listed here

The original B2 finding was that connect-core and wallet-engine read
`process.env` from distributable browser code. That path is now removed: the
core RPC table contains public fallbacks only, and the wallet worker uses a
fixed KDF work factor. Remaining `process` matches come from generated Web
Component hydration/runtime code and remain portability signals where present.

The earlier prediction that Vite would fail with `process is not defined` was
not reproduced and is not kept as a convenient failure. The remaining concern
is therefore:

> **B2 is a cross-bundler / pure-ESM / Worker portability problem, not a
> TanStack-Start browser blocker.**

Scope of what has actually been demonstrated:

| environment | status |
|---|---|
| TanStack Start + Vite (dev) | proven to work — Vite shims `process` |
| Node with `globalThis.process` deleted | no SDK RPC/env read; generated runtime may still differ |
| bare `<script type="module">` | **not tested** — no shim exists there |
| Web Worker / Service Worker context | wallet-engine worker uses fixed constants; generated runtime not tested |
| Webpack / Rollup / esbuild / Parcel without a `process` shim | **not tested** |

Gate 1 keeps reporting the raw reads as a **portability finding**, deliberately
non-fatal, so the signal survives without pretending Gate 2 reproduced a failure
it did not. Closing B2 requires evidence from the untested rows above, not from
this gate.

## Two consumers, on purpose

| | main Gate 2 (tester root) | `fixtures/wagmi-consumer` |
|---|---|---|
| role | general consumer | wagmi-aware consumer |
| wagmi / viem / react-query | **deliberately absent** | **really installed** |
| what it proves | what a consumer hits when a required peer is missing | that the supported path typechecks and builds |
| `connector-wagmi` outcome | KNOWN `missing-peer-by-design` | PASS |

`pnpm-workspace.yaml` sets `autoInstallPeers: false` at the root. pnpm defaults
it to `true`, which would have quietly installed wagmi the moment
`connector-wagmi` declared it as a required peer — and the missing-peer signal,
the entire reason this consumer exists, would have disappeared without anyone
noticing.

Nothing here may be "fixed" by installing wagmi into the root, aliasing it, or
stubbing it. Gate 2 first builds the complete consumer and records the real
missing-peer failure. It then creates a clearly labelled isolated build with
the attributable offender externalized and skipped, solely so the remaining
packages still receive production-mode browser coverage. The isolated build
never changes the full-consumer verdict.

## What B9 changed

`@naculus/connector-wagmi` value-imports `ChainNotConfiguredError` and
`SwitchChainNotSupportedError` from `wagmi` at module scope. B9 changed wagmi
from an optional peer to a required one, and that changed the failure a consumer
sees:

| | before B9 (optional peer) | after B9 (required peer) |
|---|---|---|
| dev import | `Could not resolve "wagmi" imported by "@naculus/connector-wagmi"` | `Failed to fetch dynamically imported module: .../@naculus_connector-wagmi.js` |
| production build | `[MISSING_EXPORT] "ChainNotConfiguredError" is not exported by "__vite-optional-peer-dep:wagmi:@naculus/connector-wagmi"` | `failed to resolve import "wagmi" from .../@naculus/connector-wagmi/dist/index.js` |

The old message was actively misleading: it read as though the SDK exported
something it did not, when the real problem was a package the consumer had never
installed. The bundler produced it because an absent *optional* peer is replaced
by a stub, and a stub has no named exports. Requiring the peer removes the stub,
so the error now names what to install.

`expectations.json` deliberately does not pin `build:production` to exact
bundler wording — that changes between Vite and Rolldown releases. The `code`
stays generic and the diagnostic signals live in the entry's `note`.

## Isolated production coverage

The first `vite build` fails on the unresolved `wagmi` import and
`build:production` remains KNOWN `missing-peer-by-design`. The runner attributes
that failure to `@naculus/connector-wagmi`, rebuilds with only that package
externalized, and marks its browser probe as skipped.

The isolated bundle is then served with `vite preview`. All remaining imports
and the wallet-engine Worker run from production output, so one missing required
peer can no longer erase coverage for the rest of the package set. If the
isolated rebuild still fails without a newly attributable package, the preview
leg reports `blocked-by-build-failure` and the gate fails unless that exact
condition is reviewed and recorded.

## Cleanup

Playwright downloads browsers outside the project, so `rm -rf node_modules`
does not reclaim them.

| what | where | size |
|---|---|---|
| Chromium + headless shell + ffmpeg | Windows `%LOCALAPPDATA%\ms-playwright`<br>macOS `~/Library/Caches/ms-playwright`<br>Linux `~/.cache/ms-playwright` | ~700 MB |
| packed tarballs | `artifacts/` | ~15 MB |
| gate reports | `release-gate/.results/` | < 1 MB |

```bash
npx playwright uninstall            # remove browsers installed by this project
npx playwright uninstall --all      # remove every Playwright browser on the machine
rm -rf artifacts release-gate/.results dist .tanstack
```

On Windows PowerShell, use the equivalent explicit paths:

```powershell
Remove-Item -LiteralPath artifacts, release-gate/.results, dist, .tanstack -Recurse -Force
```

The runner registers every spawned process for teardown and kills the tree on
success, on failure, on `SIGTERM`, and from a synchronous `exit` handler. One
platform caveat: Windows has no POSIX signals, so a `kill -INT` sent from an
external shell never reaches Node and only the `exit` sweep applies. A real
Ctrl-C in an interactive console does deliver `SIGINT` and is handled normally.

## Known instability: tarball integrity drifts without source changes

Re-running the pack step can change a tarball's integrity hash even when
`connect-lib` has not changed at all, which makes the root lockfile churn on
every gate run.

- `@naculus/connect` — **confirmed** `pnpm pack` metadata non-determinism.
  Packing the same three static files twice yields different SHA-256 sums, and
  the package has no build step, so nothing about its contents differs.
- `@naculus/connector-solana` — **not confirmed.** Its integrity changed across a
  pack run that also rebuilt `dist/`, but re-packing an unchanged `dist/`
  reproduced the same hash. Whether its build output is non-deterministic has not
  been tested, and must not be written up as though it had been.

Recorded as an observation, not a solved problem. Until it is addressed, "the
root lockfile must not change" and "run `pnpm gate:install`" cannot both hold.

# Release coherence — `pnpm gate:coherence`

Read-only. No pack, no install, no writes. Answers one question: does the SDK
version agree in every place it is written down?

```
packages/<x>/package.json "version"
  -> the manifest inside the packed tarball
    -> the tarball's filename
      -> tester package.json  "file:./artifacts/<name>-<version>.tgz"
        -> tester pnpm-workspace.yaml overrides
          -> tester pnpm-lock.yaml  integrity over those exact bytes
```

| check | fails when | why it matters |
| --- | --- | --- |
| `artifacts readable` | a `.tgz` cannot be gunzipped or has no manifest | a truncated artifact is one of the states this exists to name, and a stack trace names it badly |
| `filename ↔ manifest` | a tarball's name does not match the `name@version` inside it | renaming a tarball is the cheapest way to fake coherence, and it makes every other check here agree while the contents say otherwise |
| `specifiers ↔ artifacts` | `package.json`, the `overrides` block and `artifacts/` disagree, or an override points at a file that is not there | `install-artifacts.mjs` derives both specifiers from the artifact **filename**, so a version change is not local to the SDK repo |
| `single version set` | artifacts span more than one version | the SDK repos release all 18 public packages in lockstep; a mixed set means a partial bump escaped |
| `lockfile integrity` | a recorded `sha512` does not match the bytes on disk | re-packing without re-running `gate:install` leaves the lockfile attesting to bytes that no longer exist |

**What this does not check:** whether the local artifacts match what is on the
npm registry at the same version. `COHERENT` means the five local records agree
with each other — it does not mean `@naculus/siwx@0.1.6` on disk is the same
`@naculus/siwx@0.1.6` npm is serving. Registry immutability is checked upstream
by `scripts/release-preflight.mjs --expect` in connect-lib.

Fixing a mismatch is `pnpm gate:pack && pnpm gate:install`, never this script.

## Gate 3 — deterministic connector flows

Gate 2 imports all public `connect-lib` and `connect-appkit` artifacts. Gate 3
then loads the focused `/gate3.html` harness in both Vite dev and production preview and drives a local,
deterministic EIP-1193 wallet through connect, account refresh, chain switch,
accepted signing, propagated RPC failure, and disconnect. It does not require a
browser extension, chain RPC, wallet secret, or network access.

```bash
pnpm gate:3
```

The focused page uses the same public `Web3ConnectProvider` and `Web3Client` APIs
as a consumer application. It disables fee refresh for this offline harness via
the public `autoRefreshFeeOnSwitch` option; production consumers keep the
default enabled behavior. A flow report is written to
`release-gate/.results/gate3.json`; any failed step or missing report fails the
command. This makes Gate 3 a regression gate rather than a demo page.

The appkit build runs normally, while `pack.mjs` snapshots and restores the
tracked generated wrapper directories, so a release-gate run cannot overwrite
local SDK work.

Canonical version-transition sequence:

```bash
pnpm gate:pack
node release-gate/version-transition-install.mjs
pnpm gate:1
pnpm gate:coherence
pnpm gate:2
pnpm gate:3
```

The Node transition entrypoint is intentional. pnpm checks `file:` dependency
paths before starting package scripts, so `pnpm gate:install` cannot repair a
state in which the old artifact has already been removed. The transition
entrypoint performs no validation or writes itself; it only launches
`install-artifacts.mjs`, which owns validation and mutation.

The exact Gate 1 baseline is intentionally read from the current artifacts;
new failures are not accepted by editing expectations automatically. Record a
known finding in `expectations.json` only after reproducing it and deciding that
it is an explicit compatibility contract.
