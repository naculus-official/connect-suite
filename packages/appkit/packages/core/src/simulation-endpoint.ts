import { WalletError } from "@naculus/connect-core";
import { chainNumber } from "./chain-selection";
import type { WalletChain } from "./types";

/** Resolve a simulation target without ever guessing a default chain. */
export function resolveSimulationEndpoint(
  requestedChainId: number | undefined,
  fallbackChainId: number | undefined,
  requestedRpcUrl?: string,
  fallbackRpcUrl?: string,
): { chainId: number; rpcUrl: string | undefined } {
  const chainId = requestedChainId ?? fallbackChainId;
  if (chainId === undefined) {
    throw new WalletError(
      "invalid_chain",
      "No chain to simulate on. Connect a wallet or pass a chainId.",
    );
  }
  if (
    requestedChainId !== undefined &&
    fallbackChainId !== undefined &&
    requestedChainId !== fallbackChainId &&
    requestedRpcUrl === undefined
  ) {
    throw new WalletError(
      "invalid_chain",
      "Simulation chain override requires an RPC URL for that chain.",
    );
  }
  return { chainId, rpcUrl: requestedRpcUrl ?? fallbackRpcUrl };
}

/** Resolve the chain from an explicit override or CAIP-2 chain context. */
export function resolveContextSimulationEndpoint(
  requestedChainId: number | undefined,
  currentChain: WalletChain | null | undefined,
): { chainId: number; rpcUrl: string | undefined } {
  const contextChainId = currentChain
    ? (chainNumber(currentChain) ?? undefined)
    : undefined;
  if (
    requestedChainId !== undefined &&
    currentChain &&
    requestedChainId !== contextChainId
  ) {
    throw new WalletError(
      "invalid_chain",
      "Simulation chain does not match the connected chain endpoint.",
    );
  }
  return resolveSimulationEndpoint(
    requestedChainId,
    contextChainId,
    undefined,
    currentChain?.rpcUrl,
  );
}
