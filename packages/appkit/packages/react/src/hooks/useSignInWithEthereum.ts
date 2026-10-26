import { useSignInWithX } from "./useSignInWithX";
import type { UseSignInWithXOptions, UseSignInWithXReturn } from "./useSignInWithX";
import { WalletError } from "@naculus/connect-core";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { useCallback } from "react";

export interface UseSignInWithEthereumOptions extends UseSignInWithXOptions {}

export interface UseSignInWithEthereumReturn extends UseSignInWithXReturn {}

function useEip155SessionGuard(): (chainId?: string) => void {
  const { session, chainId: activeChainId } = useWeb3();
  return useCallback((chainId?: string) => {
    if (!session) {
      throw new WalletError("wallet_unavailable", "No active session");
    }
    const requestedChainId = chainId ?? activeChainId;
    if (requestedChainId && !requestedChainId.startsWith("eip155:")) {
      throw new WalletError(
        "namespace_mismatch",
        `Ethereum SIWx requires an eip155 chain, received ${requestedChainId}`,
      );
    }
    const evmNamespace = session.namespaces.eip155;
    if (!evmNamespace || evmNamespace.accounts.length === 0) {
      throw new WalletError(
        "namespace_mismatch",
        "No EVM (eip155) accounts found in session"
      );
    }
  }, [session, activeChainId]);
}

export function useSignInWithEthereum(): UseSignInWithEthereumReturn {
  const guard = useEip155SessionGuard();
  const siwx = useSignInWithX();

  const signIn = useCallback(
    async (options?: UseSignInWithEthereumOptions) => {
      guard(options?.chainId);
      return siwx.signIn(options);
    },
    [guard, siwx.signIn]
  );

  return {
    signIn,
    isSigningIn: siwx.isSigningIn,
    result: siwx.result,
    error: siwx.error,
    clearError: siwx.clearError,
  };
}
