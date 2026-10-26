import {
  createDecimalsCache,
  encodeErc20Approve,
  readDecimals,
  writeDecimals,
} from "@naculus/connect-appkit-core";
import {
  ERC20_MIN_ABI,
  formatUnits,
  parseUnits,
  type TokenConfig,
  WalletError,
} from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import {
  computed,
  onScopeDispose,
  shallowRef,
  toValue,
  unref,
  watch,
} from "vue";
import type { ERC20Reader, ERC20Sender } from "./erc20";
import { assertErc20Context } from "./erc20";

const MAX_UINT256 = (1n << 256n) - 1n;

export interface UseERC20ApproveOptions {
  token: MaybeRefOrGetter<TokenConfig>;
  spender: MaybeRefOrGetter<`0x${string}`>;
  account: MaybeRefOrGetter<string | null | undefined>;
  chainId: MaybeRefOrGetter<number | undefined>;
  connected: MaybeRefOrGetter<boolean>;
  publicClient: MaybeRefOrGetter<ERC20Reader | null | undefined>;
  sendTransaction: MaybeRef<ERC20Sender>;
}

export interface UseERC20ApproveReturn {
  approve: (amount: string) => Promise<`0x${string}`>;
  approveMax: () => Promise<`0x${string}`>;
  allowanceRaw: ShallowRef<bigint | null>;
  allowance: ComputedRef<string | null>;
  hasAllowance: (required: string) => Promise<boolean>;
  isApproving: ShallowRef<boolean>;
  isFetchingAllowance: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  refetchAllowance: () => Promise<bigint | null>;
}

/** Vue state shell for ERC-20 approvals through caller-owned read/send actions. */
export function useERC20Approve(
  options: UseERC20ApproveOptions,
): UseERC20ApproveReturn {
  const initialToken = toValue(options.token);
  const decimals = createDecimalsCache(initialToken, initialToken.decimals);
  const allowanceRaw = shallowRef<bigint | null>(null);
  const isApproving = shallowRef(false);
  const isFetchingAllowance = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let generation = 0;
  let allowanceGeneration = 0;
  let disposed = false;

  watch(
    [
      () => toValue(options.token).address,
      () => toValue(options.token).chainId,
      () => toValue(options.token).decimals,
      () => toValue(options.spender),
      () => toValue(options.account),
      () => toValue(options.chainId),
      () => toValue(options.connected),
      () => toValue(options.publicClient),
      () => unref(options.sendTransaction),
    ],
    () => {
      generation++;
      allowanceGeneration++;
      allowanceRaw.value = null;
      isApproving.value = false;
      isFetchingAllowance.value = false;
      error.value = null;
    },
    { flush: "sync" },
  );

  const context = () => {
    const token = toValue(options.token);
    const account = assertErc20Context(
      token,
      toValue(options.chainId),
      toValue(options.account),
      toValue(options.connected),
    );
    const reader = toValue(options.publicClient);
    if (!reader)
      throw new WalletError("wallet_unavailable", "No public client");
    return { token, account, reader, spender: toValue(options.spender) };
  };

  const readPrecision = async (): Promise<number> => {
    const { token, reader } = context();
    let precision = readDecimals(decimals, token, token.decimals);
    if (precision === undefined) {
      precision = Number(
        await reader.readContract({
          address: token.address,
          abi: ERC20_MIN_ABI,
          functionName: "decimals",
        }),
      );
      writeDecimals(decimals, token, precision);
    }
    return precision;
  };

  const refetchAllowance = async (): Promise<bigint | null> => {
    const own = ++allowanceGeneration;
    allowanceRaw.value = null;
    error.value = null;
    isFetchingAllowance.value = true;
    try {
      const { token, account, reader, spender } = context();
      const raw = BigInt(
        (await reader.readContract({
          address: token.address,
          abi: ERC20_MIN_ABI,
          functionName: "allowance",
          args: [account, spender],
        })) as bigint | string | number,
      );
      if (disposed || own !== allowanceGeneration) return null;
      allowanceRaw.value = raw;
      return raw;
    } catch (cause) {
      if (!disposed && own === allowanceGeneration) {
        error.value =
          cause instanceof Error
            ? cause
            : new Error("Failed to fetch allowance");
      }
      return null;
    } finally {
      if (!disposed && own === allowanceGeneration)
        isFetchingAllowance.value = false;
    }
  };

  const doApprove = async (rawAmount: bigint): Promise<`0x${string}`> => {
    const own = ++generation;
    error.value = null;
    isApproving.value = true;
    try {
      const { token, spender } = context();
      const hash = await unref(options.sendTransaction)({
        to: token.address,
        data: encodeErc20Approve(spender, rawAmount),
        value: "0",
      });
      if (!disposed && own === generation) void refetchAllowance();
      return hash;
    } catch (cause) {
      const normalized =
        cause instanceof Error ? cause : new Error("Approve failed");
      if (!disposed && own === generation) error.value = normalized;
      throw normalized;
    } finally {
      if (!disposed && own === generation) isApproving.value = false;
    }
  };

  const approve = async (amount: string): Promise<`0x${string}`> => {
    const contextGeneration = generation;
    let rawAmount: bigint;
    try {
      const precision = await readPrecision();
      if (contextGeneration !== generation || disposed) {
        throw new WalletError(
          "session_inactive",
          "Wallet or token context changed. Retry the approval.",
        );
      }
      rawAmount = parseUnits(amount, precision);
    } catch (cause) {
      const normalized =
        cause instanceof Error ? cause : new Error("Approve failed");
      if (!disposed && contextGeneration === generation)
        error.value = normalized;
      throw normalized;
    }
    return doApprove(rawAmount);
  };
  const approveMax = (): Promise<`0x${string}`> => doApprove(MAX_UINT256);
  const hasAllowance = async (required: string): Promise<boolean> => {
    const raw = allowanceRaw.value ?? (await refetchAllowance());
    if (raw === null) return false;
    return raw >= parseUnits(required, await readPrecision());
  };

  const allowance = computed(() => {
    if (allowanceRaw.value === null) return null;
    const token = toValue(options.token);
    const precision = readDecimals(decimals, token, token.decimals);
    return precision === undefined
      ? null
      : formatUnits(allowanceRaw.value, precision);
  });

  onScopeDispose(() => {
    disposed = true;
    generation++;
    allowanceGeneration++;
  });
  return {
    approve,
    approveMax,
    allowanceRaw,
    allowance,
    hasAllowance,
    isApproving,
    isFetchingAllowance,
    error,
    refetchAllowance,
  };
}
