import {
  AA_SUPPORTED_CHAINS,
  type Address,
  DEFAULT_ENTRY_POINT,
  type Hex,
  type SmartAccountConfig,
  WalletError,
} from "@naculus/connect-core";
import { resolveEvmChainId } from "./aa-chain";

/**
 * The decisions the smart-account hooks share, kept out of both framework
 * shells: which chain a UserOperation targets, how the account config is
 * assembled from options, and what a wallet's signature must look like.
 */

export type SmartAccountType = "simple" | "light" | "kernel" | "safe";

export interface SmartAccountOptionsLike {
  chainId?: string;
  entryPoint?: Address;
  accountType?: SmartAccountType;
  salt?: bigint;
}

/**
 * Target chain for a UserOperation. Fails closed: no chain → error rather
 * than mainnet; a connected wallet on a different chain → chain_mismatch,
 * because the signature it would produce is for the wrong domain.
 */
export function resolveUserOpChain(
  optionsChainId: string | undefined,
  connectedChainId: string | null | undefined,
): string {
  const chainId = resolveEvmChainId(optionsChainId, connectedChainId);
  if (!chainId) {
    throw new WalletError(
      "invalid_chain",
      optionsChainId || connectedChainId
        ? `Invalid EVM chain ID: ${optionsChainId ?? connectedChainId}`
        : "No EVM chain to send on. Connect a wallet or pass options.chainId.",
    );
  }
  if (connectedChainId && connectedChainId !== chainId) {
    throw new WalletError(
      "chain_mismatch",
      `Connected chain ${connectedChainId} does not match UserOperation chain ${chainId}.`,
    );
  }
  return chainId;
}

/** Account config from owner, CAIP-2 chain and options; entry point falls back per chain. */
export function buildSmartAccountConfig(
  owner: Address,
  chainId: string,
  options: SmartAccountOptionsLike = {},
): SmartAccountConfig {
  return {
    owner,
    accountType: options.accountType ?? "simple",
    entryPoint:
      options.entryPoint ??
      AA_SUPPORTED_CHAINS[chainId]?.entryPoint ??
      DEFAULT_ENTRY_POINT,
    chainId,
    salt: options.salt,
  };
}

/** A wallet's answer to a signing request must be non-empty even-length hex. */
export function assertHexSignature(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new WalletError(
      "signature_rejected",
      "Wallet returned an invalid UserOperation signature.",
    );
  }
  return value as Hex;
}
