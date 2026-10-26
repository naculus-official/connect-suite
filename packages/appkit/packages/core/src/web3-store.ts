/**
 * Framework-agnostic core of the connect provider.
 *
 * appkit's stated shape is "write the Stencil components once, generate the
 * React and Vue wrappers". In practice `react/` carries ~8.5k hand-written
 * lines against `vue/`'s ~280, and only two files in `react/src` contain JSX —
 * the rest is logic wearing React clothes. Web Components also cannot serve
 * React Native or Flutter, so the presentation layer was never going to be the
 * thing worth sharing.
 *
 * This module is the first piece moved out: the state machine and the pure
 * helpers around it, with no React import. Everything here is consumable from
 * Vue, Svelte, or a native binding as-is, and `web3-store.test.ts` asserts the
 * absence of a framework import so the boundary cannot rot back.
 */
import { logger } from "@naculus/connect-core";
import type { ConnectionStatus, Web3State } from "./types";

// ── Async helpers ──────────────────────────────────────────────────────

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operation",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries) {
        const delay = options.baseDelay * 2 ** attempt;
        logger.warn(
          "appkit/core",
          `Retry attempt ${attempt + 1}/${options.maxRetries} after ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ── CAIP normalization ─────────────────────────────────────────────────

/**
 * Convert EIP-1193 chainChanged values into the CAIP-2 form used by sessions.
 * Refuses chain 0 and anything above `Number.MAX_SAFE_INTEGER`, as
 * connect-core's `normalizeEip155ChainId` does; switch to that export once
 * the connect-lib release that adds it is the minimum supported version.
 */
export function normalizeEip155ChainId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let raw: string;
  if (value.startsWith("eip155:")) {
    raw = value.slice("eip155:".length);
    if (!/^\d+$/.test(raw)) return undefined;
  } else if (/^0x[0-9a-f]+$/i.test(value) || /^\d+$/.test(value)) {
    raw = value;
  } else {
    return undefined;
  }
  let numeric: bigint;
  try {
    numeric = BigInt(raw);
  } catch {
    // Ignore malformed wallet events rather than corrupting session state.
    return undefined;
  }
  if (numeric <= 0n || numeric > BigInt(Number.MAX_SAFE_INTEGER)) {
    return undefined;
  }
  return `eip155:${numeric.toString(10)}`;
}

export function toEip155Accounts(
  accounts: unknown[],
  chainId: string,
): string[] {
  const reference = chainId.split(":")[1];
  if (!reference) return [];
  return accounts
    .filter(
      (account): account is string =>
        typeof account === "string" && account.length > 0,
    )
    .map((account) =>
      account.includes(":") ? (account.split(":").pop() as string) : account,
    )
    .map((account) => `eip155:${reference}:${account}`);
}

/**
 * Numeric EIP-155 chain id, or undefined for any other namespace.
 *
 * The previous implementation took the last CAIP segment and ran parseInt over
 * it, which stops at the first non-digit: `solana:5eykt4Us…` became 5 — an
 * EVM chain id — so asking for Solana mainnet's token list returned Goerli's,
 * and `xrpl:0` became chain 0. Anchor the whole reference instead.
 */
export function eip155ChainIdToNumber(chainId: string): number | undefined {
  const match = /^eip155:([1-9][0-9]*)$/.exec(chainId);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  return Number.isSafeInteger(numeric) ? numeric : undefined;
}

// ── State machine ──────────────────────────────────────────────────────

export type Web3Action =
  | { type: "SET_STATUS"; payload: ConnectionStatus }
  | { type: "SET_SESSION"; payload: Web3State["session"] }
  | { type: "SET_ACCOUNTS"; payload: string[] }
  | { type: "SET_CHAIN"; payload: string | null }
  | { type: "SET_ERROR"; payload: Error | null }
  | { type: "RESET" };

export const initialWeb3State: Web3State = {
  status: "disconnected",
  session: null,
  accounts: [],
  chainId: null,
  error: null,
};

export function web3Reducer(state: Web3State, action: Web3Action): Web3State {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.payload };
    case "SET_SESSION":
      return { ...state, session: action.payload };
    case "SET_ACCOUNTS":
      return { ...state, accounts: action.payload };
    case "SET_CHAIN":
      return { ...state, chainId: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "RESET":
      return initialWeb3State;
    default:
      return state;
  }
}
