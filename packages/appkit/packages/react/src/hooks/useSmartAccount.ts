/**
 * useSmartAccount
 *
 * React hook for ERC-4337 Smart Account lifecycle management.
 * Provides create, deploy, and address lookup for smart contract wallets.
 *
 * @example
 * ```tsx
 * const { address, isDeployed, createWallet, deployWallet, isLoading } = useSmartAccount({
 *   rpcUrl: "https://eth.llamarpc.com",
 *   bundlerUrl: "https://api.pimlico.io/v2/1/rpc?apikey=...",
 * });
 * ```
 */

import {
  bareEvmAddress,
  buildSmartAccountConfig,
  resolveEvmChainId,
} from "@naculus/connect-appkit-core";
import type {
  Address,
  SmartAccountConfig,
  SmartAccountInfo,
} from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { useAccount } from "./useAccount";

function accountError(message: string): WalletError {
  return new WalletError("wallet_unavailable", message);
}

export interface UseSmartAccountOptions {
  /** RPC URL for the target chain */
  rpcUrl?: string;
  /** Bundler RPC URL */
  bundlerUrl?: string;
  /** Chain ID (CAIP-2 format) */
  chainId?: string;
  /** ERC-4337 EntryPoint address for the selected supported chain */
  entryPoint?: Address;
  /** Account type (default: "simple") */
  accountType?: "simple" | "light" | "kernel" | "safe";
  /** Optional salt for deterministic address */
  salt?: bigint;
}

export interface UseSmartAccountReturn {
  /** Smart account address (null if not created) */
  address: Address | null;
  /** Whether the account is deployed on-chain */
  isDeployed: boolean;
  /** Smart account info object */
  accountInfo: SmartAccountInfo | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Create a new smart account (compute address) */
  createWallet: () => Promise<SmartAccountInfo | null>;
  /** Deploy the smart account to chain */
  deployWallet: () => Promise<Address | null>;
  /** Get the counterfactual address without creating */
  getAddress: () => Promise<Address | null>;
}

/**
 * Hook for managing a ERC-4337 Smart Contract Wallet lifecycle.
 *
 * @param options - Smart account configuration options
 * @returns Smart account state and actions
 */
export function useSmartAccount(
  options?: UseSmartAccountOptions,
): UseSmartAccountReturn {
  const { evmAccount } = useAccount();
  const { session, chainId: connectedChainId, client } = useWeb3();
  const [address, setAddress] = useState<Address | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [accountInfo, setAccountInfo] = useState<SmartAccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const managerRef = useRef<
    import("@naculus/connect-core").SmartAccountManager | null
  >(null);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);

  // Initialize SmartAccountManager on config change (with cleanup to prevent race conditions)
  useEffect(() => {
    managerRef.current = null;
    if (!options?.rpcUrl) {
      return;
    }

    let cancelled = false;

    import("@naculus/connect-core")
      .then(({ SmartAccountManager }) => {
        if (cancelled) return; // prevent stale state update
        // No mainnet default: a manager built for the wrong chain reads the
        // wrong EntryPoint and derives an address the user never sees.
        const chainId = resolveEvmChainId(options.chainId, connectedChainId);
        if (!chainId) return;
        managerRef.current = new SmartAccountManager({
          rpcUrl: options.rpcUrl!,
          chainId,
          bundlerClient: {
            url: options.bundlerUrl ?? "",
          },
        });
      })
      .catch((err) => {
        if (cancelled) return; // prevent stale state update
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to load account-abstraction module"),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    connectedChainId,
    options?.rpcUrl,
    options?.bundlerUrl,
    options?.chainId,
  ]);

  // Account and chain changes invalidate derived state. A result from the
  // previous owner must never remain visible as the current smart account.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The effect intentionally resets derived state when any account configuration value changes.
  useEffect(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    setAddress(null);
    setIsDeployed(false);
    setAccountInfo(null);
    setIsLoading(false);
    setError(null);
  }, [
    evmAccount,
    connectedChainId,
    options?.rpcUrl,
    options?.bundlerUrl,
    options?.chainId,
    options?.entryPoint,
    options?.accountType,
    options?.salt,
  ]);

  // Get account config from options + connected EOA
  const getConfig = useCallback((): SmartAccountConfig | null => {
    const owner = bareEvmAddress(evmAccount);
    if (!owner || !managerRef.current) return null;
    // Returning null rather than assuming a chain. getConfig already has a
    // null contract, and every caller checks it.
    const chainId = resolveEvmChainId(options?.chainId, connectedChainId);
    if (!chainId) return null;

    return buildSmartAccountConfig(owner, chainId, {
      accountType: options?.accountType,
      entryPoint: options?.entryPoint,
      salt: options?.salt,
    });
  }, [
    evmAccount,
    connectedChainId,
    options?.accountType,
    options?.chainId,
    options?.entryPoint,
    options?.salt,
  ]);

  const fail = useCallback((nextError: Error): null => {
    setError(nextError);
    return null;
  }, []);

  const ensureOperation = useCallback((): number | null => {
    if (inFlightRef.current) {
      return null;
    }
    inFlightRef.current = true;
    return generationRef.current;
  }, []);

  const finishOperation = useCallback((operation: number): void => {
    if (generationRef.current === operation) inFlightRef.current = false;
  }, []);

  // Create wallet (compute counterfactual address)
  const createWallet =
    useCallback(async (): Promise<SmartAccountInfo | null> => {
      const config = getConfig();
      if (!config || !managerRef.current) {
        return fail(new Error("Smart account not configured"));
      }

      const operation = ensureOperation();
      if (operation === null)
        return fail(new Error("Smart account operation already in progress"));

      setIsLoading(true);
      setError(null);

      try {
        const manager = managerRef.current;
        const info = await manager.createAccount(config);
        if (generationRef.current !== operation) return null;
        setAddress(info.address);
        setIsDeployed(info.isDeployed);
        setAccountInfo(info);
        return info;
      } catch (err) {
        if (generationRef.current !== operation) return null;
        const e =
          err instanceof Error
            ? err
            : new Error("Failed to create smart account");
        setError(e);
        return null;
      } finally {
        if (generationRef.current === operation) setIsLoading(false);
        finishOperation(operation);
      }
    }, [ensureOperation, fail, finishOperation, getConfig]);

  // Deploy wallet
  const deployWallet = useCallback(async (): Promise<Address | null> => {
    const config = getConfig();
    if (!config || !managerRef.current) {
      return fail(new Error("Smart account not configured"));
    }

    if (!session) return fail(accountError("No active session"));
    const activeClient = resolveClient(client);
    if (!activeClient) return fail(accountError("Client not initialized"));
    if (connectedChainId && connectedChainId !== config.chainId) {
      return fail(
        new WalletError(
          "chain_mismatch",
          `Connected chain ${connectedChainId} does not match smart account chain ${config.chainId}.`,
        ),
      );
    }

    const operation = ensureOperation();
    if (operation === null)
      return fail(new Error("Smart account operation already in progress"));

    setIsLoading(true);
    setError(null);

    try {
      const manager = managerRef.current;
      const before = await manager.createAccount(config);
      if (generationRef.current !== operation) return null;
      if (before.isDeployed) {
        setAddress(before.address);
        setIsDeployed(true);
        setAccountInfo(before);
        return before.address;
      }

      // SmartAccountManager.deployAccount intentionally refuses to broadcast
      // an account that is not deployed. Build the factory transaction and route it
      // through the active wallet instead.
      const deployTx = await manager.getDeployCallData(config);
      const deployResult = (await activeClient.sendTransaction(session, {
        transaction: {
          to: deployTx.to,
          data: deployTx.data,
          value: deployTx.value.toString(),
        },
        chainId: config.chainId,
      })) as Address;

      if (generationRef.current !== operation) return null;
      const after = await manager.createAccount(config);
      setAddress(after.address);
      setIsDeployed(after.isDeployed);
      setAccountInfo(after);
      return deployResult;
    } catch (err) {
      if (generationRef.current !== operation) return null;
      const e =
        err instanceof Error
          ? err
          : new Error("Failed to deploy smart account");
      setError(e);
      return null;
    } finally {
      if (generationRef.current === operation) setIsLoading(false);
      finishOperation(operation);
    }
  }, [
    client,
    connectedChainId,
    ensureOperation,
    fail,
    finishOperation,
    getConfig,
    session,
  ]);

  // Get counterfactual address
  const getAddress = useCallback(async (): Promise<Address | null> => {
    const config = getConfig();
    if (!config || !managerRef.current) return null;
    const generation = generationRef.current;

    try {
      const addr = await managerRef.current.getAccountAddress(config);
      if (generationRef.current !== generation) return null;
      setAddress(addr);
      return addr;
    } catch (err) {
      if (generationRef.current !== generation) return null;
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to get smart account address"),
      );
      return null;
    }
  }, [getConfig]);

  return {
    address,
    isDeployed,
    accountInfo,
    isLoading,
    error,
    createWallet,
    deployWallet,
    getAddress,
  };
}
