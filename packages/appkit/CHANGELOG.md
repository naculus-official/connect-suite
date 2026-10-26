# Changelog

All notable changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## 0.14.2 — 2026-10-26

- Replaces 0.14.1, which was prepared but never published. Its changes are included here: connect-lib dependency ranges are aligned to `^0.14.2`, so no appkit package resolves a mixed connect-lib range.
- First release published from the connect-suite monorepo; package manifests point at `naculus-official/connect-suite`.
- React Native: `AuthorizationConsentNative` and `AuthorizationListNative` now wrap their literal text in `<Text>`. React Native throws on text outside `<Text>`, so these screens could fail to render; this is a bug fix. No public API changes.
- Build and lint configuration: Stencil `tsconfig` include and Biome schema 2.6.3.
- Test files were reformatted by lint; their assertions are unchanged.
- All six packages release in lockstep at 0.14.2.

## 0.14.0 — 2026-10-25

- **Breaking, inherited from connect-lib 0.14.0:** a passphrase is required for wallet storage in every runtime; `rails` are required in session key scopes and grants. See connect-lib `docs/MIGRATION-0.14.md`.
- Dependency move to `@naculus/connect-core` `^0.14.0`; this release follows connect-lib 0.14.0.
- All six packages release in lockstep at 0.14.0.

## [0.13.0] - 2026-10-19

- **Breaking, inherited from connect-lib 0.13.0:** a session-key scope that should sign x402 exact or MPP charge payments must list them in `rails`; a scope without `rails` refuses EIP-3009 signing. The shared session-key manager in `@naculus/connect-appkit-core` passes scopes through unchanged, so apps must re-create affected grants. See the connect-lib 0.13.0 changelog for the security fixes in this line.
- All six packages require connect-lib 0.13: every connect-lib dependency and peer range moves from `^0.12.0` to `^0.13.0`.
- `@naculus/connect-appkit-core`, `@naculus/connect-appkit-react`, `@naculus/connect-appkit-ui`, `@naculus/connect-appkit-vue`, `@naculus/connect-appkit-wc`, and `@naculus/connect-native`: no appkit source changes; version bump with the new connect-lib range.
- All six packages release in lockstep at 0.13.0.

## [0.12.1] - 2026-10-11

- `@naculus/connect-appkit-react`: remove the unused optional UI dependency, so React consumers do not install UI assets automatically. Users who need UI components must explicitly install `@naculus/connect-appkit-ui`.
- `@naculus/connect-appkit-ui`: update lucide-react to 1.52.0.
- Development tooling: align Storybook and its React/Vite adapter at 10.6.1; update jscpd to 5.4.0.
- `@naculus/connect-appkit-core`, `@naculus/connect-appkit-vue`, `@naculus/connect-appkit-wc`, and `@naculus/connect-native`: version bump only.
- All six packages release in lockstep at 0.12.1; connect-lib dependency ranges remain ^0.12.0.
