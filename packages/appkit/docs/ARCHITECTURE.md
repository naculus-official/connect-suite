# @naculus/connect-react Architecture

> Last updated: 2026-07-22
> Purpose: record design decisions, avoid repeated questions.

---

## Component layering

```
User Application
      │
      v
connect-ui (components)  ← ConnectButton, AccountButton, ChainSelector, modals
      │
      v
connect-react (hooks)    ← useWallet, useConnect, useSendTransaction, useSIWxSession
      │
      v
connect-lib (logic)      ← ConnectorManager, UniversalConnector, SIWx, wallet-engine
```

### Hooks layer (`@naculus/connect-react`)

- Stateless React hooks wrapping `connect-lib` primitives
- `useWeb3` provider reads from React context — no direct ConnectorManager instantiation
- Each hook subscribes to a slice of wallet state via the provider
- Hooks are framework-specific but contain no UI markup

### Provider layer

`Web3ConnectProvider` / `NaculusProvider`:

- Initializes `ConnectorManager` with config (projectId, metadata, storage)
- Manages singleton wallet session state
- React Context provides state + dispatch to all child hooks
- Auto-reconnects persisted sessions on mount

### UI layer (`@naculus/connect-ui`)

- shadcn/ui components (Button, Dialog, DropdownMenu, etc.) bundled internally
- No host Tailwind/shadcn required — works standalone (Mode A)
- Can inherit host theme when available (Mode B)
- Components call `connect-react` hooks internally — users never interact with hooks directly

---

## ComponentRegistry pattern

All UI components resolve through a central registry, making every component swappable:

```tsx
import { ComponentRegistry, ConnectButton } from "@naculus/connect-ui";
import { MyButton } from "@/components/ui/button";

<ComponentRegistry components={{ Button: MyButton }}>
  <ConnectButton />
</ComponentRegistry>
```

Resolution priority:

1. Custom components registered in `ComponentRegistry` (highest)
2. Host environment's same-named shadcn components
3. `@naculus/connect-ui` built-in shadcn components
4. Fallback components (pure div, extreme degradation only)

Only passed-in components are overridden — others keep built-in defaults. Single-level registry, no nested scoping.

---

## Theme system

Three modes managed by `ThemeProvider`:

| Mode | priority | Setup |
|------|----------|-------|
| A — Standalone | `fallback` (default) | Zero config. Built-in shadcn + CSS vars. |
| B — Inherit | `computed` | Auto-detects host CSS variables via `getComputedStyle`. Fills gaps only. |
| C — Custom | any + `ComponentRegistry` | Host-defined CSS vars + component overrides. |

All colors flow through CSS variables (`--background`, `--foreground`, `--primary`, etc.). Components never reference raw hex values — theming is a variable swap at the `:root` level.

Dark/light toggle via `.dark` class on `<html>`. Components do not use `dark:` Tailwind modifiers — CSS variables switch automatically.

---

## Relationship to connect-lib

```
connect-lib/                    ← framework-agnostic connection logic
  ├── connect-core              ← UniversalConnector, ConnectorManager, types
  ├── connector-walletconnect   ← WalletConnect v2 bridge
  ├── connector-evm-injected    ← EIP-6963 browser wallets
  ├── connector-embedded        ← Self-custodial wallet
  ├── connector-solana / -xrpl  ← Chain-specific connectors
  ├── connector-passkeys        ← WebAuthn passkeys
  ├── wallet-engine             ← BIP39, HD derivation, signing
  └── siwx                      ← CAIP-122 cross-chain identity

connect-react/                  ← React bindings
  ├── connect-react             ← Hooks + provider wrapping connect-lib
  └── connect-ui                ← shadcn-based components consuming connect-react

Dependency direction:
connect-lib → connect-react → connect-ui
(unidirectional — lib has no awareness of React)
```

**Rationale for split:** Frontend was 52.7% of the original monorepo. After splitting:
- Library can be published as a framework-agnostic npm package
- Frontend iterates independently without affecting the library
- Library tests are faster (no jsdom, no React)

---

## Known limitations

| Item | Status | Mitigation |
|------|--------|-----------|
| ComponentRegistry is single-level (no nested scoping) | Ponytail — full convergence | Add nested scoping if micro-frontend patterns emerge |
| `useSmartAccount` uses hardcoded EntryPoint `0x0000...7032` (v0.7) | Ponytail — partial | Accept EntryPoint as config param when v0.8 migration needed |
| `useValidateDestination` uses static blackhole address list | Ponytail — partial | Expand from on-chain analytics. Static list covers 99% of cases. |
| i18n uses static key-value map (`t()`), no pluralization/ICU | Ponytail — full | Add `react-intl` when i18n coverage broadens |
