/**
 * useSendUserOperation
 *
 * React hook for sending ERC-4337 UserOperations.
 * Uses the core SmartAccountManager so address derivation, deployment,
 * nonce reads, gas estimation, signing, and bundler serialization stay on one
 * implementation path.
 */

import {
  assertHexSignature,
  bareEvmAddress,
  buildSmartAccountConfig,
  resolveUserOpChain,
} from "@naculus/connect-appkit-core";
import type {
  Address,
  Call,
  Hex,
  SendUserOpOptions,
  UniversalWalletSession,
  UserOperationReceipt,
  UserOperationResponse,
} from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { useAccount } from "./useAccount";

async function signHashWithSession(
  session: NonNullable<ReturnType<typeof useWeb3>["session"]>,
  client: ReturnType<typeof useWeb3>["client"],
  hash: Hex,
  address: Address,
  chainId: string,
): Promise<Hex> {
  const activeClient = resolveClient(client);
  if (!activeClient) {
    throw new WalletError("wallet_unavailable", "Client not initialized");
  }

  const params = [hash, address];
  if (session.walletType === "eip6963" || session.id?.startsWith("eip6963-")) {
    // `signMessage` accepts text and encodes it before personal_sign. A
    // UserOperation hash must instead reach the wallet as the original 32
    // bytes, so use the connector's raw EIP-1193 request here.
    const { eip6963Connector } = await import(
      "@naculus/connector-evm-injected"
    );
    const wallet = eip6963Connector
      .getDiscoveredWallets()
      .find((candidate) => candidate.id === session.walletId);
    const result = wallet
      ? await wallet.provider.request({ method: "personal_sign", params })
      : await eip6963Connector.request({
          method: "personal_sign",
          params,
        });
    return assertHexSignature(result);
  }

  if (session.walletType === "walletconnect") {
    return assertHexSignature(
      await activeClient.connector.request({
        method: "personal_sign",
        params,
      }),
    );
  }

  if (session.walletType === "embedded") {
    const embedded = activeClient.embeddedConnector as {
      signHash?: (
        session: UniversalWalletSession,
        hash: Hex,
      ) => Promise<`0x${string}`>;
    } | null;
    if (!embedded?.signHash) {
      throw new WalletError(
        "method_unsupported",
        "This embedded wallet build cannot sign a raw digest. Upgrade @naculus/connector-embedded or pass an explicit signer.",
      );
    }
    return assertHexSignature(await embedded.signHash(session, hash));
  }

  if (session.walletType === "passkeys") {
    // Not a missing primitive: a passkey signs with P-256 (COSE alg -7) and a
    // SimpleAccount recovers a secp256k1 key, so no wiring here can make the
    // two agree. It needs an account implementation that verifies P-256 on
    // chain — a WebAuthn validator, or RIP-7212 where the precompile exists.
    // Saying so is the difference between a fixable gap and an impossible one.
    throw new WalletError(
      "method_unsupported",
      "Passkeys sign with P-256, which a SimpleAccount cannot verify. Use a smart account with a WebAuthn validator, or pass an explicit signer.",
    );
  }

  throw new WalletError(
    "method_unsupported",
    `Raw UserOperation signing is not available for ${session.walletType} on ${chainId}. Pass a signer that signs the raw 32-byte hash.`,
  );
}

export interface UseSendUserOperationOptions {
  /** RPC URL for the target chain */
  rpcUrl?: string;
  /** Bundler RPC URL */
  bundlerUrl?: string;
  /** Chain ID (CAIP-2 format) */
  chainId?: string;
  /** EntryPoint contract address */
  entryPoint?: Address;
  /** Smart account implementation type (default: "simple") */
  accountType?: "simple" | "light" | "kernel" | "safe";
  /** Optional salt for deterministic smart account address */
  salt?: bigint;
  /** Override the connected EVM account as the smart account owner */
  owner?: Address;
  /**
   * Optional signer for the UserOperation hash. A custom signer is assumed to
   * apply the signature scheme selected by `signerMode`.
   */
  signer?: (hash: Hex) => Promise<Hex> | Hex;
  /** Signature hash format expected by the account implementation */
  signerMode?: "raw" | "eip191";
}

export interface UseSendUserOperationReturn {
  /** Send a UserOperation with the given calls */
  sendUserOp: (
    calls: Call[],
    options?: SendUserOpOptions,
  ) => Promise<UserOperationResponse | null>;
  /** The userOpHash from the last send */
  userOpHash: Hex | null;
  /** The receipt from the last UserOperation (null while pending) */
  receipt: UserOperationReceipt | null;
  /** Whether a UserOperation is currently being sent */
  isPending: boolean;
  /** Loading state for gas estimation and submission */
  isEstimating: boolean;
  /** Error state */
  error: Error | null;
  /** Reset state */
  reset: () => void;
}

/**
 * Hook for sending ERC-4337 UserOperations to a bundler.
 *
 * The connected EVM account is used as the smart-account owner. The hook uses
 * the active wallet's raw `personal_sign` request for WalletConnect and
 * injected wallets; embedded/passkey users must provide a raw-hash signer until
 * those connectors expose one.
 */
export function useSendUserOperation(
  options?: UseSendUserOperationOptions,
): UseSendUserOperationReturn {
  const { evmAccount } = useAccount();
  const { session, chainId: connectedChainId, client } = useWeb3();
  const [userOpHash, setUserOpHash] = useState<Hex | null>(null);
  const [receipt, setReceipt] = useState<UserOperationReceipt | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      // Receipt polling can outlive the component. Invalidate its callbacks so
      // an unmounted hook cannot publish stale state.
      requestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, []);

  // A context change invalidates an in-flight operation. The manager captures
  // the old owner, chain, and signer in its closure, so its result must not be
  // published after React has rendered a new wallet context.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The effect intentionally resets operation state when the wallet context changes.
  useEffect(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    setUserOpHash(null);
    setReceipt(null);
    setIsPending(false);
    setIsEstimating(false);
    setError(null);
  }, [
    client,
    connectedChainId,
    evmAccount,
    options?.accountType,
    options?.bundlerUrl,
    options?.chainId,
    options?.entryPoint,
    options?.owner,
    options?.rpcUrl,
    options?.salt,
    options?.signerMode,
    session,
  ]);

  const sendUserOp = useCallback(
    async (
      calls: Call[],
      opts?: SendUserOpOptions,
    ): Promise<UserOperationResponse | null> => {
      const fail = (nextError: Error): null => {
        setError(nextError);
        return null;
      };

      if (!options?.rpcUrl) return fail(new Error("RPC URL not configured"));
      if (!options.bundlerUrl)
        return fail(new Error("Bundler URL not configured"));
      if (!calls.length)
        return fail(new Error("At least one call is required"));
      if (inFlightRef.current) {
        return fail(new Error("A UserOperation is already in progress"));
      }

      const owner = bareEvmAddress(options.owner ?? evmAccount);
      if (!owner)
        return fail(
          new WalletError("wallet_unavailable", "No EVM account found"),
        );

      // No mainnet default. The mismatch check below is skipped when there is
      // no connected chain, so defaulting there would build and sign a
      // UserOperation for chain 1 with nothing to contradict it — and the
      // chain ID is part of the hash the user approves.
      let targetChainId: string;
      try {
        targetChainId = resolveUserOpChain(options.chainId, connectedChainId);
      } catch (chainError) {
        return fail(chainError as Error);
      }
      if (!options.signer && !session) {
        return fail(new WalletError("wallet_unavailable", "No active session"));
      }

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;
      setIsPending(true);
      setIsEstimating(true);
      setError(null);
      setUserOpHash(null);
      setReceipt(null);

      try {
        const { SmartAccountManager } = await import("@naculus/connect-core");
        const signer =
          options.signer ??
          ((hash: Hex) =>
            signHashWithSession(session!, client, hash, owner, targetChainId));
        const manager = new SmartAccountManager({
          rpcUrl: options.rpcUrl,
          bundlerClient: { url: options.bundlerUrl },
          chainId: targetChainId,
          signer,
          // The wallet's personal_sign request applies EIP-191 itself. A
          // caller-supplied signer retains the core's historical default.
          signerMode: options.signer ? (options.signerMode ?? "eip191") : "raw",
        });
        const config = buildSmartAccountConfig(owner, targetChainId, options);

        const response = await manager.sendUserOperation(config, calls, opts);
        if (requestId !== requestIdRef.current) return null;

        setIsEstimating(false);
        setUserOpHash(response.userOpHash);

        // The core manager owns the receipt polling policy and validates the
        // receipt shape. A timeout should leave the submitted hash available;
        // callers can decide how to surface that pending state.
        void manager
          .getUserOperationReceipt(response.userOpHash)
          .then((nextReceipt) => {
            if (requestId === requestIdRef.current) setReceipt(nextReceipt);
          })
          .catch(() => undefined);

        return response;
      } catch (err) {
        if (requestId !== requestIdRef.current) return null;
        const nextError =
          err instanceof Error
            ? err
            : new Error("Failed to send UserOperation");
        setError(nextError);
        return null;
      } finally {
        // The operation that took the single-flight slot has settled, whether
        // or not its result is still wanted.
        inFlightRef.current = false;
        if (requestId === requestIdRef.current) {
          setIsPending(false);
          setIsEstimating(false);
        }
      }
    },
    [client, connectedChainId, evmAccount, options, session],
  );

  // reset() does not unlock single-flight: an operation already handed to
  // the manager may still sign and broadcast, and a second sendUserOp in the
  // meantime would be a second on-chain side effect. The flag clears when
  // that operation settles.
  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setUserOpHash(null);
    setReceipt(null);
    setIsPending(false);
    setIsEstimating(false);
    setError(null);
  }, []);

  return {
    sendUserOp,
    userOpHash,
    receipt,
    isPending,
    isEstimating,
    error,
    reset,
  };
}
