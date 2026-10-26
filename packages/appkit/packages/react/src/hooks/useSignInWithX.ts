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

export interface UseSignInWithXOptions {
  domain?: string;
  statement?: string;
  uri?: string;
  chainId?: string;
  expirySeconds?: number;
  resources?: string[];
  requestId?: string;
}

export interface UseSignInWithXReturn {
  signIn: (options?: UseSignInWithXOptions) => Promise<SiwxResult>;
  isSigningIn: boolean;
  result: SiwxResult | null;
  error: Error | null;
  clearError: () => void;
}

export function useSignInWithX(): UseSignInWithXReturn {
  const { session, chainId: currentChainId, client } = useWeb3();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [result, setResult] = useState<SiwxResult | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(
    async (options?: UseSignInWithXOptions): Promise<SiwxResult> => {
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

        const message = createSiwxMessage({
          domain,
          address,
          uri,
          version: 1,
          chainId,
          nonce,
          issuedAt,
          statement: options?.statement,
          expirationTime: options?.expirySeconds
            ? new Date(Date.now() + options.expirySeconds * 1000).toISOString()
            : undefined,
          resources: options?.resources,
          requestId: options?.requestId,
        });

        const signature = (await activeClient.signMessage(session, {
          message,
          address,
          chainId: chainId ?? undefined,
        })) as string;

        const expirationTime = options?.expirySeconds
          ? new Date(Date.now() + options.expirySeconds * 1000).toISOString()
          : null;

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

        setResult(siwxResult);
        return siwxResult;
      } catch (err) {
        const wrappedErr =
          err instanceof Error ? err : new Error("SIWx sign-in failed");
        setError(wrappedErr);
        throw wrappedErr;
      } finally {
        setIsSigningIn(false);
      }
    },
    [session, currentChainId, client],
  );

  return { signIn, isSigningIn, result, error, clearError };
}
