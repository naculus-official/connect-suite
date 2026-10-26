import {
  chainNumber,
  createDecimalsCache,
  encodeErc20Transfer,
  readDecimals,
  writeDecimals,
} from "@naculus/connect-appkit-core";
import type { TokenConfig } from "@naculus/connect-core";
import { ERC20_MIN_ABI, parseUnits, WalletError } from "@naculus/connect-core";
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

// ── Types ─────────────────────────────────────────────────────────

export interface UseERC20TransferOptions {
  token: TokenConfig;
}

export interface UseERC20TransferReturn {
  /** Send a transfer. Returns tx hash on success. */
  sendTransfer: (to: Address, amount: string) => Promise<`0x${string}`>;
  isSending: boolean;
  error: Error | null;
}

// ── Hook ──────────────────────────────────────────────────────────

export function useERC20Transfer(
  options: UseERC20TransferOptions,
): UseERC20TransferReturn {
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
  const { isCurrent, assertCurrent } = useERC20Context({
    token: options.token,
    chainId: currentChain
      ? (chainNumber(currentChain) ?? undefined)
      : undefined,
    owner: evmAccount,
    connected: isConnected,
    publicClient,
    walletClient,
    session,
    client,
  });

  // Keyed by token: a bare ref kept the first token's precision when the user
  // switched tokens, and converted the amount with the wrong scale.
  const decimalsRef = useRef(
    createDecimalsCache(options.token, options.token.decimals),
  );
  const error = localError ?? sendTxError;

  const sendTransfer = useCallback(
    async (to: Address, amount: string): Promise<`0x${string}`> => {
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
        const err = new WalletError(
          "wallet_unavailable",
          "No public client available",
        );
        setLocalError(err);
        throw err;
      }

      // Transferring on the wrong chain sends the call to whatever contract
      // occupies this address there. The decimals read below would come from
      // that contract too, so the amount would be wrong as well.
      try {
        assertCurrent();

        const address = toBareAddress(evmAccount);

        // Fetch decimals if not cached
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
        const data = encodeErc20Transfer(to, rawAmount);

        const activeClient = resolveClient(client);
        // Strategy 1: session-based connector
        if (session) {
          if (activeClient) {
            const txHash = await sendTransaction({
              to: options.token.address,
              data,
              value: "0",
            });
            return txHash as `0x${string}`;
          }
        }

        // Strategy 2: embedded wallet via viem wallet client
        if (walletClient) {
          const { request } = await publicClient.simulateContract({
            address: options.token.address,
            abi: ERC20_MIN_ABI,
            functionName: "transfer",
            args: [to, rawAmount],
            account: address,
          });
          assertCurrent();
          const txHash = await walletClient.writeContract(request);
          return txHash;
        }

        // Strategy 3: fallback to sendTransaction hook
        const txHash = await sendTransaction({
          to: options.token.address,
          data,
          value: "0",
        });
        return txHash as `0x${string}`;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Transfer failed");
        if (isCurrent()) setLocalError(error);
        throw error;
      }
    },
    [
      options.token,
      publicClient,
      walletClient,
      evmAccount,
      isConnected,
      session,
      client,
      sendTransaction,
      reset,
      assertCurrent,
      isCurrent,
    ],
  );

  return {
    sendTransfer,
    isSending,
    error,
  };
}
