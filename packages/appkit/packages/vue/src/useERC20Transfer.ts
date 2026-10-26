import {
  createDecimalsCache,
  encodeErc20Transfer,
  readDecimals,
  writeDecimals,
} from "@naculus/connect-appkit-core";
import {
  ERC20_MIN_ABI,
  parseUnits,
  type TokenConfig,
  WalletError,
} from "@naculus/connect-core";
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, unref, watch } from "vue";
import type { ERC20Reader, ERC20Sender } from "./erc20";
import { assertErc20Context } from "./erc20";

export interface UseERC20TransferOptions {
  token: MaybeRefOrGetter<TokenConfig>;
  account: MaybeRefOrGetter<string | null | undefined>;
  chainId: MaybeRefOrGetter<number | undefined>;
  connected: MaybeRefOrGetter<boolean>;
  publicClient: MaybeRefOrGetter<ERC20Reader | null | undefined>;
  sendTransaction: MaybeRef<ERC20Sender>;
}

export interface UseERC20TransferReturn {
  sendTransfer: (to: `0x${string}`, amount: string) => Promise<`0x${string}`>;
  isSending: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
}

/** Vue state shell for an ERC-20 transfer through a caller-owned send action. */
export function useERC20Transfer(
  options: UseERC20TransferOptions,
): UseERC20TransferReturn {
  const initialToken = toValue(options.token);
  const decimals = createDecimalsCache(initialToken, initialToken.decimals);
  const isSending = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let generation = 0;
  let disposed = false;

  watch(
    [
      () => toValue(options.token).address,
      () => toValue(options.token).chainId,
      () => toValue(options.token).decimals,
      () => toValue(options.account),
      () => toValue(options.chainId),
      () => toValue(options.connected),
      () => toValue(options.publicClient),
      () => unref(options.sendTransaction),
    ],
    () => {
      generation++;
      isSending.value = false;
      error.value = null;
    },
    { flush: "sync" },
  );

  const sendTransfer: UseERC20TransferReturn["sendTransfer"] = async (
    to,
    amount,
  ) => {
    const own = ++generation;
    const token = toValue(options.token);
    const reader = toValue(options.publicClient);
    const stillCurrent = (): boolean => !disposed && own === generation;
    error.value = null;
    isSending.value = true;
    try {
      assertErc20Context(
        token,
        toValue(options.chainId),
        toValue(options.account),
        toValue(options.connected),
      );
      if (!reader) {
        throw new WalletError(
          "wallet_unavailable",
          "No public client available",
        );
      }
      let precision = readDecimals(decimals, token, token.decimals);
      if (precision === undefined) {
        precision = Number(
          await reader.readContract({
            address: token.address,
            abi: ERC20_MIN_ABI,
            functionName: "decimals",
          }),
        );
        if (!stillCurrent()) {
          throw new WalletError(
            "session_inactive",
            "Wallet or token context changed. Retry the transfer.",
          );
        }
        writeDecimals(decimals, token, precision);
      }
      const data = encodeErc20Transfer(to, parseUnits(amount, precision));
      return await unref(options.sendTransaction)({
        to: token.address,
        data,
        value: "0",
      });
    } catch (cause) {
      const normalized =
        cause instanceof Error ? cause : new Error("Transfer failed");
      if (stillCurrent()) error.value = normalized;
      throw normalized;
    } finally {
      if (stillCurrent()) isSending.value = false;
    }
  };

  onScopeDispose(() => {
    disposed = true;
    generation++;
  });
  return { sendTransfer, isSending, error };
}
