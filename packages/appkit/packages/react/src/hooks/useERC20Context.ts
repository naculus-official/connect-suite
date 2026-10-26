import type { TokenConfig } from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { tokenChainMismatch } from "@naculus/connect-appkit-core";

interface ERC20ContextOptions {
  token: TokenConfig;
  chainId: number | undefined;
  owner: string | null;
  spender?: string;
  connected?: boolean;
  publicClient: unknown;
  walletClient?: unknown;
  session?: unknown;
  client?: unknown;
}

export interface ERC20Context {
  /**
   * Stable token for the current context.
   *
   * Changes only when the context itself changes, so it is safe to compare
   * cached results against with `===`.
   */
  identity: object;
  /** Whether the caller's captured context is still the mounted one. */
  isCurrent: () => boolean;
  /** Throw unless the context still holds and the token is on the active chain. */
  assertCurrent: () => void;
}

/**
 * Identify the wallet/token context by value, not by object reference.
 *
 * The reference form was hostage to consumer prop hygiene. `publicClient` is
 * memoized on `currentChain`, which is memoized on `config.chains` — and a
 * consumer writing `config={{ chains: [...] }}` inline, which is ordinary
 * React, produces a new array every render. That churned the identity every
 * render, which made `isCurrent()` false for work that was in fact still
 * current and re-fired the effects keyed on these callbacks.
 *
 * What identifies the context is the values an operation targets: the token,
 * the chain, the parties, and whether a client exists at all. Two different
 * `publicClient` objects pointing at the same chain describe the same
 * operation, so they must compare equal. The client facade is deliberately not
 * part of it: which object routes the call does not change what the call does.
 */
function contextKey(options: ERC20ContextOptions): string {
  return [
    options.token.address.toLowerCase(),
    options.token.chainId ?? "",
    options.token.decimals ?? "",
    options.chainId ?? "",
    options.owner ?? "",
    options.spender ?? "",
    options.connected ? "1" : "0",
    options.publicClient ? "1" : "0",
    options.walletClient ? "1" : "0",
    // Session identity, not the object: a re-created wrapper around the same
    // session is the same session.
    (options.session as { id?: string } | undefined)?.id ?? "",
  ].join("|");
}

/** Bind reads and pre-signing work to the wallet/token context that started it. */
export function useERC20Context(options: ERC20ContextOptions): ERC20Context {
  const { token, chainId } = options;
  const address = token.address.toLowerCase() as TokenConfig["address"];
  const key = contextKey(options);

  // One object per distinct context. Callers compare cached results against it.
  const identity = useMemo(() => ({ key }), [key]);

  const latestKey = useRef(key);
  const mounted = useRef(true);

  useLayoutEffect(() => {
    latestKey.current = key;
  }, [key]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Compares the key captured when the callback was created against the newest
  // one, so work started under a previous account, token, or chain can tell
  // that it no longer speaks for the component.
  const isCurrent = useCallback(
    () => mounted.current && latestKey.current === key,
    [key],
  );

  const assertCurrent = useCallback(() => {
    if (!isCurrent()) {
      throw new WalletError(
        "session_inactive",
        "Wallet or token context changed. Retry the operation with the current account and chain.",
      );
    }
    // Checked here rather than only at the call sites: every path that signs or
    // reads goes through this, and a token on another chain resolves to a
    // different contract at the same address.
    const mismatch = tokenChainMismatch(
      { address, chainId: token.chainId },
      chainId,
    );
    if (mismatch) throw mismatch;
  }, [isCurrent, address, token.chainId, chainId]);

  return { identity, isCurrent, assertCurrent };
}
