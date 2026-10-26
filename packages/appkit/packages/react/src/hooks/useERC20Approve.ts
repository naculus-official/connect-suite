import {
  chainNumber,
  createDecimalsCache,
  encodeErc20Approve,
  readDecimals,
  writeDecimals,
} from "@naculus/connect-appkit-core";
import type { TokenConfig } from "@naculus/connect-core";
import {
  ERC20_MIN_ABI,
  formatUnits,
  parseUnits,
  WalletError,
} from "@naculus/connect-core";
import { useCallback, useRef, useState } from "react";
import type { Address } from "viem";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";
import { useAccount } from "./useAccount";
import { useChain } from "./useChain";
import { useERC20Context } from "./useERC20Context";
import { useSendTransaction } from "./useSendTransaction";
import { useViemClient } from "./useViemClient";

// ── Helpers ───────────────────────────────────────────────────────

function toBareAddress(addr: string): Address {
  return (addr.includes(":") ? addr.split(":").pop()! : addr) as Address;
}

// ── Constants ─────────────────────────────────────────────────────

const MAX_UINT256 = 2n ** 256n - 1n;

// ── Types ─────────────────────────────────────────────────────────

export interface UseERC20ApproveOptions {
  token: TokenConfig;
  spender: Address;
}

export interface UseERC20ApproveReturn {
  /** Approve a specific amount */
  approve: (amount: string) => Promise<`0x${string}`>;
  /** Approve max (type(uint256).max — infinite approval) */
  approveMax: () => Promise<`0x${string}`>;
  /** Current allowance as raw bigint */
  allowanceRaw: bigint | null;
  /** Current allowance as human-readable string */
  allowance: string | null;
  /** Check if allowance >= required amount */
  hasAllowance: (required: string) => Promise<boolean>;
  isApproving: boolean;
  isFetchingAllowance: boolean;
  error: Error | null;
  /**
   * Re-read the allowance and return it.
   *
   * The value is returned because reading `allowanceRaw` immediately after
   * awaiting this does not work: that binding belongs to the render that
   * created the callback, and setState does not rewrite it.
   */
  refetchAllowance: () => Promise<bigint | null>;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useERC20Approve(
  options: UseERC20ApproveOptions,
): UseERC20ApproveReturn {
  const { publicClient, walletClient } = useViemClient();
  const { evmAccount, isConnected } = useAccount();
  const { currentChain } = useChain();
  const { session, client } = useWeb3();
  const {
    sendTransaction,
    isSending,
    error: sendTxError,
    reset,
  } = useSendTransaction();
  const [localError, setLocalError] = useState<Error | null>(null);
  const { identity, isCurrent, assertCurrent } = useERC20Context({
    token: options.token,
    chainId: currentChain
      ? (chainNumber(currentChain) ?? undefined)
      : undefined,
    owner: evmAccount,
    spender: options.spender,
    connected: isConnected,
    publicClient,
    walletClient,
    session,
    client,
  });
  const [read, setRead] = useState<{
    identity: object;
    raw: bigint | null;
    fetching: boolean;
  } | null>(null);
  const allowanceRaw = read?.identity === identity ? read.raw : null;
  const isFetchingAllowance = read?.identity === identity && read.fetching;

  const decimalsRef = useRef(
    createDecimalsCache(options.token, options.token.decimals),
  );
  const allowanceGenerationRef = useRef(0);
  const error = localError ?? sendTxError;

  const ownerAddress = (() => {
    if (!evmAccount) return null;
    return toBareAddress(evmAccount);
  })();

  // Returns what it read. Callers that need the value cannot get it from
  // `allowanceRaw` right after awaiting: that binding is the one captured at
  // render, and a setState does not rewrite it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chainId keeps the callback per chain, so the refetch effect keyed on it runs when only the chain changes
  const fetchAllowance = useCallback(async (): Promise<bigint | null> => {
    if (!isCurrent()) return null;
    const generation = ++allowanceGenerationRef.current;
    const stillCurrent = () =>
      isCurrent() && generation === allowanceGenerationRef.current;
    setRead({
      identity,
      raw: null,
      fetching: !!publicClient && !!ownerAddress && isConnected,
    });
    setLocalError(null);
    if (!publicClient || !ownerAddress || !isConnected) return null;
    try {
      assertCurrent();
      const raw = (await publicClient.readContract({
        address: options.token.address,
        abi: ERC20_MIN_ABI,
        functionName: "allowance",
        args: [ownerAddress, options.spender],
      })) as bigint;
      if (!stillCurrent()) return null;
      setRead({ identity, raw, fetching: false });
      return raw;
    } catch (err) {
      if (stillCurrent()) {
        setRead({ identity, raw: null, fetching: false });
        setLocalError(
          err instanceof Error ? err : new Error("Failed to fetch allowance"),
        );
      }
      return null;
    }
  }, [
    publicClient,
    ownerAddress,
    options.token.address,
    options.token.chainId,
    options.spender,
    identity,
    isCurrent,
    assertCurrent,
    isConnected,
  ]);

  const allowance = (() => {
    if (allowanceRaw === null) return null;
    // No `?? 18`: guessing a token's precision misstates every amount derived
    // from it, and 18 is only right for the tokens that happen to use it.
    const decimals = readDecimals(
      decimalsRef.current,
      options.token,
      options.token.decimals,
    );
    if (decimals === undefined) return null;
    return formatUnits(allowanceRaw, decimals);
  })();

  const doApprove = useCallback(
    async (rawAmount: bigint): Promise<`0x${string}`> => {
      setLocalError(null);
      reset();

      if (!isConnected || !evmAccount) {
        const err = new WalletError(
          "wallet_unavailable",
          "No connected account",
        );
        setLocalError(err);
        throw err;
      }

      if (!publicClient) {
        const err = new WalletError("wallet_unavailable", "No public client");
        setLocalError(err);
        throw err;
      }

      // Approving on the wrong chain grants a spender rights over whatever
      // contract sits at this address there, which is not the token the user
      // was shown.
      try {
        assertCurrent();
        const data = encodeErc20Approve(options.spender, rawAmount);
        const activeClient = resolveClient(client);
        if (session) {
          if (activeClient) {
            const txHash = await sendTransaction({
              to: options.token.address,
              data,
              value: "0",
            });
            fetchAllowance();
            return txHash as `0x${string}`;
          }
        }

        if (walletClient) {
          const { request } = await publicClient.simulateContract({
            address: options.token.address,
            abi: ERC20_MIN_ABI,
            functionName: "approve",
            args: [options.spender, rawAmount],
            account: ownerAddress!,
          });
          assertCurrent();
          const txHash = await walletClient.writeContract(request);
          fetchAllowance();
          return txHash;
        }

        const txHash = await sendTransaction({
          to: options.token.address,
          data,
          value: "0",
        });
        fetchAllowance();
        return txHash as `0x${string}`;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Approve failed");
        if (isCurrent()) setLocalError(error);
        throw error;
      }
    },
    [
      options,
      publicClient,
      walletClient,
      evmAccount,
      isConnected,
      session,
      client,
      ownerAddress,
      sendTransaction,
      reset,
      fetchAllowance,
      assertCurrent,
      isCurrent,
    ],
  );

  const approveAmount = useCallback(
    async (amount: string): Promise<`0x${string}`> => {
      try {
        assertCurrent();
        if (!publicClient)
          throw new WalletError("wallet_unavailable", "No public client");

        let decimals = readDecimals(
          decimalsRef.current,
          options.token,
          options.token.decimals,
        );
        if (decimals === undefined) {
          decimals = (await publicClient.readContract({
            address: options.token.address,
            abi: ERC20_MIN_ABI,
            functionName: "decimals",
          })) as number;
          assertCurrent();
          writeDecimals(decimalsRef.current, options.token, decimals);
        }

        const rawAmount = parseUnits(amount, decimals);
        return await doApprove(rawAmount);
      } catch (err) {
        if (isCurrent())
          setLocalError(
            err instanceof Error ? err : new Error("Approve failed"),
          );
        throw err;
      }
    },
    [options.token, publicClient, doApprove, assertCurrent, isCurrent],
  );

  const approveMaxAmount = useCallback(async (): Promise<`0x${string}`> => {
    return doApprove(MAX_UINT256);
  }, [doApprove]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the token fields it reads (address, chainId, decimals); the token object identity changes every render
  const checkAllowance = useCallback(
    async (required: string): Promise<boolean> => {
      if (!isCurrent() || !isConnected || !ownerAddress || !publicClient)
        return false;
      try {
        assertCurrent();
      } catch (err) {
        setLocalError(
          err instanceof Error ? err : new Error("Cannot check allowance"),
        );
        return false;
      }
      // `allowanceRaw` is the render-time binding, so awaiting a refetch never
      // changed it — the second null check below used to always hit, and this
      // gate answered false on every first call. Callers reading it as "no
      // approval yet" prompted for an approval the user had already granted.
      const current = allowanceRaw ?? (await fetchAllowance());
      if (current === null) return false;

      // No `decimals = 18` fallback. This is a gate: a caller does
      // `if (await hasAllowance(x)) skipApprove()`, so a wrong precision here
      // is a wrong answer to "is it safe to skip the approval", not a
      // misformatted string. Read the token instead, and refuse if that fails.
      let decimals = readDecimals(
        decimalsRef.current,
        options.token,
        options.token.decimals,
      );
      if (decimals === undefined) {
        if (!publicClient) {
          throw new WalletError(
            "wallet_unavailable",
            "Cannot check allowance: no public client to read token decimals.",
          );
        }
        decimals = (await publicClient.readContract({
          address: options.token.address,
          abi: ERC20_MIN_ABI,
          functionName: "decimals",
        })) as number;
        if (!isCurrent()) return false;
        writeDecimals(decimalsRef.current, options.token, decimals);
      }

      const requiredRaw = parseUnits(required, decimals);
      return isCurrent() && current >= requiredRaw;
    },
    [
      allowanceRaw,
      fetchAllowance,
      options.token.address,
      options.token.chainId,
      options.token.decimals,
      publicClient,
      isCurrent,
      assertCurrent,
      isConnected,
      ownerAddress,
    ],
  );

  return {
    approve: approveAmount,
    approveMax: approveMaxAmount,
    allowance,
    allowanceRaw,
    hasAllowance: checkAllowance,
    isApproving: isSending,
    isFetchingAllowance,
    error,
    refetchAllowance: fetchAllowance,
  };
}
