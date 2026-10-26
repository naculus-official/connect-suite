import {
  isEvmAddress,
  parseCaip10,
  type UniversalWalletSession,
} from "@naculus/connect-core";
import {
  walletX402Signer,
  type X402TypedDataSigner,
} from "@naculus/payments-x402";

export type { X402TypedDataSigner } from "@naculus/payments-x402";

export type X402SignerUnavailableReason =
  | "no-session"
  | "not-evm"
  | "unsupported-wallet-type";

export interface X402Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export type X402WalletResolution =
  | {
      provider: X402Eip1193Provider;
      address: `0x${string}`;
      reason: null;
    }
  | {
      provider: null;
      address: null;
      reason: X402SignerUnavailableReason;
    };

/** Where a session's EIP-1193 provider can come from; each framework supplies its own. */
export interface X402ProviderSources {
  /** EIP-6963 wallets discovered on the page (`eip6963Connector.getDiscoveredWallets()`). */
  injected?: readonly { id: string; provider: X402Eip1193Provider }[];
  /** The WalletConnect connector, whose `request` routes to its last session. */
  walletConnect?: X402Eip1193Provider | null;
}

/**
 * The provider that belongs to `session`, chosen by the session's wallet
 * type (never by connector identity): the injected wallet the session was
 * made with, or the WalletConnect connector. Null for anything else.
 */
export function findX402Provider(
  session: UniversalWalletSession | null | undefined,
  sources: X402ProviderSources,
): X402Eip1193Provider | null {
  if (!session) return null;
  if (session.walletType === "eip6963" || session.id.startsWith("eip6963-")) {
    return (
      sources.injected?.find((wallet) => wallet.id === session.walletId)
        ?.provider ?? null
    );
  }
  if (session.walletType === "walletconnect") {
    return sources.walletConnect ?? null;
  }
  return null;
}

export interface X402SignerResolution {
  signer: X402TypedDataSigner | null;
  reason: X402SignerUnavailableReason | null;
}

function unavailable(
  reason: X402SignerUnavailableReason,
): X402WalletResolution {
  return { provider: null, address: null, reason };
}

/**
 * Resolve the connected EVM payer without coupling appkit-core to a connector.
 *
 * Framework bindings supply the EIP-1193 request facade owned by the active
 * session. Classification remains session-based: connector identity is never
 * used as a routing input.
 */
export function resolveX402Wallet(
  session: UniversalWalletSession | null | undefined,
  provider: X402Eip1193Provider | null | undefined,
): X402WalletResolution {
  if (!session) return unavailable("no-session");

  const namespace = session.namespaces.eip155;
  if (!namespace) return unavailable("not-evm");

  const isInjected =
    session.walletType === "eip6963" || session.id.startsWith("eip6963-");
  const isWalletConnect = session.walletType === "walletconnect";
  if ((!isInjected && !isWalletConnect) || !provider?.request) {
    return unavailable("unsupported-wallet-type");
  }

  for (const account of namespace.accounts) {
    const parsed = parseCaip10(account);
    const address = parsed?.namespace === "eip155" ? parsed.address : account;
    if (isEvmAddress(address)) {
      return {
        provider,
        address: address as `0x${string}`,
        reason: null,
      };
    }
  }

  return unavailable("not-evm");
}

/** Build the signer after applying the shared session-routing policy. */
export function createX402WalletSigner(
  session: UniversalWalletSession | null | undefined,
  provider: X402Eip1193Provider | null | undefined,
  switchChain: (chainId: string) => Promise<void>,
): X402SignerResolution {
  const resolved = resolveX402Wallet(session, provider);
  if (resolved.reason) return { signer: null, reason: resolved.reason };
  return {
    signer: walletX402Signer({
      provider: resolved.provider,
      address: resolved.address,
      switchChain,
    }),
    reason: null,
  };
}
