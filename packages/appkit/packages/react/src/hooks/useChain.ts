import { useMemo } from "react";
import {
  chainsForNamespace,
  describeChain,
  resolveChain,
} from "@naculus/connect-appkit-core";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import type { ChainInfo, WalletChain } from "../types";

/**
 * The connected chain, and the chains it is possible to switch to.
 *
 * All the judgement lives in `core/chain-selection.ts`, which imports no
 * framework — the Vue binding for this is the same three calls.
 */
export function useChain() {
  const { chainId, session, switchChain, chains } = useWeb3();

  const currentChain = useMemo<WalletChain | null>(
    () => resolveChain(chains, chainId),
    [chains, chainId],
  );

  // Gated on the session, unlike `currentChain`. The two answer different
  // questions: `currentChain` is the chain this client is pointed at,
  // `chainInfo` is the chain of the connection that exists. A consumer
  // rendering chain details only while connected depends on the difference.
  const chainInfo = useMemo<ChainInfo | null>(
    () => (session ? describeChain(chains, chainId) : null),
    [chains, chainId, session],
  );

  // Only the chains the connected wallet could actually switch to. Offering
  // an EVM chain to a Solana wallet presents an action that cannot work.
  const availableChains = useMemo<WalletChain[]>(
    () => chainsForNamespace(chains, chainId),
    [chains, chainId],
  );

  return {
    chainId,
    currentChain,
    chainInfo,
    availableChains,
    chains: availableChains,
    isEvm: chainId?.startsWith("eip155:") ?? false,
    switchChain,
  };
}
