/**
 * useSIWxLogin — Trigger a SIWx sign-in flow.
 *
 * A simplified hook for initiating wallet sign-in.
 * Returns a `signIn()` function and loading/error state.
 */

import {
  defaultSiwxDomain,
  defaultSiwxUri,
} from "@naculus/connect-appkit-core";
import { WalletError } from "@naculus/connect-core";
import {
  createSiwxMessage,
  generateNonce,
  getBlockchainName,
  issueNonce,
  nowISO,
  type SiwxResult,
} from "@naculus/siwx";
import { useCallback, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { selectSiwxAccount } from "./siwx-accounts";

// ── Types ────────────────────────────────────────────────────────

export interface UseSIWxLoginOptions {
  /** Originating domain (default: window.location.host) */
  domain?: string;
  /** Human-readable statement */
  statement?: string;
  /** RFC 3986 URI (default: window.location.origin) */
  uri?: string;
  /** CAIP-2 chain ID (default: current chain from Web3 context) */
  chainId?: string;
  /** Session lifetime in seconds (default: 86400 = 24h) */
  expirySeconds?: number;
  /** URIs of resources the identity wishes to access */
  resources?: string[];
  /** CAIP-74 request ID */
  requestId?: string;
}

export interface UseSIWxLoginReturn {
  /** Trigger the SIWx sign-in flow */
  signIn: (options?: UseSIWxLoginOptions) => Promise<SiwxResult>;
  /** Whether a sign-in is in progress */
  isSigningIn: boolean;
  /** Last sign-in error */
  error: Error | null;
  /** Clear the last error */
  clearError: () => void;
}

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_EXPIRY_SECONDS = 86_400; // 24h

// ── Hook ─────────────────────────────────────────────────────────

export function useSIWxLogin(): UseSIWxLoginReturn {
  const { session, chainId: currentChainId, client } = useWeb3();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(
    async (options?: UseSIWxLoginOptions): Promise<SiwxResult> => {
      if (!session) {
        throw new WalletError("wallet_unavailable", "No active session");
      }

      // No mainnet default. This value becomes the `Chain ID:` field of the
      // CAIP-122 message the user signs, so an assumed chain is an assertion
      // the user never made — and on a wallet sitting on another chain, a
      // signature that binds to the wrong one.
      const chainId = options?.chainId ?? currentChainId;
      if (!chainId) {
        throw new WalletError(
          "invalid_chain",
          "No chain to sign for. Connect a wallet or pass options.chainId.",
        );
      }
      const account = selectSiwxAccount(session, chainId);
      if (!account) {
        throw new WalletError("wallet_unavailable", "No account found");
      }
      const activeClient = resolveClient(client);
      if (!activeClient) {
        throw new WalletError("wallet_unavailable", "Client not initialized");
      }
      const { address } = account;
      const location =
        typeof window === "undefined" ? undefined : window.location;
      const domain = options?.domain ?? defaultSiwxDomain(location);
      const uri = options?.uri ?? defaultSiwxUri(location);
      setIsSigningIn(true);
      setError(null);

      try {
        const nonce = generateNonce();
        await issueNonce(nonce);
        const issuedAt = nowISO();
        const expirySeconds = options?.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;
        const expirationTime = new Date(
          Date.now() + expirySeconds * 1000,
        ).toISOString();

        // Build the CAIP-122 message string
        const message = createSiwxMessage({
          domain,
          address,
          uri,
          version: 1,
          chainId,
          nonce,
          issuedAt,
          expirationTime,
          statement: options?.statement,
          resources: options?.resources,
          requestId: options?.requestId,
        });

        const signature = (await activeClient.signMessage(session, {
          message,
          address,
          chainId: chainId ?? undefined,
        })) as string;

        const siwxResult: SiwxResult = {
          message: {
            raw: message,
            domain,
            address,
            statement: options?.statement ?? null,
            uri,
            version: 1,
            chainId,
            nonce,
            issuedAt,
            blockchain: getBlockchainName(chainId),
            expirationTime,
            notBefore: null,
            resources: options?.resources ?? [],
            requestId: options?.requestId ?? null,
          },
          signature,
        };

        setIsSigningIn(false);
        return siwxResult;
      } catch (err) {
        const wrappedErr =
          err instanceof Error ? err : new Error("SIWx sign-in failed");
        setError(wrappedErr);
        setIsSigningIn(false);
        throw wrappedErr;
      }
    },
    [session, currentChainId, client],
  );

  return { signIn, isSigningIn, error, clearError };
}
