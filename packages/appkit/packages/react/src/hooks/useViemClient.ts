import { chainNumber, toViemChain } from "@naculus/connect-appkit-core";
import { useMemo } from "react";
import { createPublicClient, http, createWalletClient, type PublicClient, type WalletClient } from "viem";
import type { WalletChain } from "../types";
import { useAccount } from "./useAccount";
import { useChain } from "./useChain";

export function useViemClient(): {
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  chains: WalletChain[];
} {
  const { evmAccount, isConnected } = useAccount();
  const { currentChain, chains } = useChain();

  // Null for anything that is not EIP-155. viem speaks to EVM nodes, and a
  // client built with a stand-in number would address a real chain that is
  // not the one connected.
  const evmChainNumber = currentChain ? chainNumber(currentChain) : null;
  // Memoized: `toViemChain` builds a fresh object per call, and an unmemoized
  // one would change identity every render — which drives the client effects
  // below into a loop that never settles.
  const viemChain = useMemo(
    () => (currentChain ? toViemChain(currentChain, evmChainNumber) : null),
    [currentChain, evmChainNumber],
  );

  const publicClient = useMemo<PublicClient | null>(() => {
    if (!viemChain) return null;

    return createPublicClient({
      transport: http(viemChain.rpcUrls.default.http[0]),
      chain: viemChain,
    });
  }, [viemChain]);

  const walletClient = useMemo<WalletClient | null>(() => {
    if (!isConnected || !evmAccount || !viemChain) return null;

    const address = evmAccount.includes(":") ? evmAccount.split(":").pop()! : evmAccount;

    return createWalletClient({
      transport: http(viemChain.rpcUrls.default.http[0]),
      chain: viemChain,
      account: address as `0x${string}`
    });
  }, [isConnected, evmAccount, viemChain]);

  return {
    publicClient,
    walletClient,
    chains
  };
}