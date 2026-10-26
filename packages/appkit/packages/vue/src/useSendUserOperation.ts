import {
  bareEvmAddress,
  buildSmartAccountConfig,
  resolveUserOpChain,
  type SmartAccountType,
} from "@naculus/connect-appkit-core";
import type {
  Address,
  Call,
  Hex,
  SendUserOpOptions,
  UserOperationReceipt,
  UserOperationResponse,
} from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";
import type { MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { onScopeDispose, shallowRef, toValue, unref } from "vue";

/** Signs the 32-byte UserOperation hash. Raw or EIP-191, per signerMode. */
export type UserOpSigner = (hash: Hex) => Promise<Hex> | Hex;

export interface UseSendUserOperationOptions {
  account: MaybeRefOrGetter<string | null | undefined>;
  connectedChainId: MaybeRefOrGetter<string | null | undefined>;
  rpcUrl: MaybeRefOrGetter<string | undefined>;
  bundlerUrl: MaybeRefOrGetter<string | undefined>;
  chainId?: MaybeRefOrGetter<string | undefined>;
  entryPoint?: Address;
  accountType?: SmartAccountType;
  salt?: bigint;
  /** Override the connected account as the smart-account owner. */
  owner?: MaybeRefOrGetter<Address | undefined>;
  /**
   * Required. Vue has no wallet provider to fall back to, so the caller
   * supplies the signer for the UserOperation hash. Its output is validated
   * by the manager, not trusted.
   */
  signer: MaybeRef<UserOpSigner>;
  signerMode?: "raw" | "eip191";
}

export interface UseSendUserOperationReturn {
  sendUserOp: (
    calls: Call[],
    opts?: SendUserOpOptions,
  ) => Promise<UserOperationResponse | null>;
  userOpHash: ShallowRef<Hex | null>;
  receipt: ShallowRef<UserOperationReceipt | null>;
  isPending: ShallowRef<boolean>;
  isEstimating: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  reset: () => void;
}

/**
 * Build, sign and submit one UserOperation, mirroring the React hook.
 * Preconditions fail closed before anything is signed: configured URLs,
 * at least one call, a resolvable chain that matches the connected one, an
 * owner address. Only one operation may be in flight; a result for a
 * superseded request is dropped.
 */
export function useSendUserOperation(
  options: UseSendUserOperationOptions,
): UseSendUserOperationReturn {
  const userOpHash = shallowRef<Hex | null>(null);
  const receipt = shallowRef<UserOperationReceipt | null>(null);
  const isPending = shallowRef(false);
  const isEstimating = shallowRef(false);
  const error = shallowRef<Error | null>(null);
  let requestId = 0;
  let inFlight = false;
  let disposed = false;

  const fail = (cause: Error): null => {
    error.value = cause;
    return null;
  };

  const sendUserOp = async (
    calls: Call[],
    opts?: SendUserOpOptions,
  ): Promise<UserOperationResponse | null> => {
    const rpcUrl = toValue(options.rpcUrl);
    const bundlerUrl = toValue(options.bundlerUrl);
    if (!rpcUrl) return fail(new Error("RPC URL not configured"));
    if (!bundlerUrl) return fail(new Error("Bundler URL not configured"));
    if (!calls.length) return fail(new Error("At least one call is required"));
    if (inFlight) {
      return fail(new Error("A UserOperation is already in progress"));
    }
    const owner = bareEvmAddress(
      toValue(options.owner) ?? toValue(options.account),
    );
    if (!owner) {
      return fail(
        new WalletError("wallet_unavailable", "No EVM account found"),
      );
    }
    let targetChainId: string;
    try {
      targetChainId = resolveUserOpChain(
        toValue(options.chainId),
        toValue(options.connectedChainId),
      );
    } catch (chainError) {
      return fail(chainError as Error);
    }
    const signer = unref(options.signer);

    const own = ++requestId;
    inFlight = true;
    isPending.value = true;
    isEstimating.value = true;
    error.value = null;
    userOpHash.value = null;
    receipt.value = null;
    try {
      const { SmartAccountManager } = await import("@naculus/connect-core");
      const manager = new SmartAccountManager({
        rpcUrl,
        bundlerClient: { url: bundlerUrl },
        chainId: targetChainId,
        signer,
        signerMode: options.signerMode ?? "eip191",
      });
      const config = buildSmartAccountConfig(owner, targetChainId, {
        accountType: options.accountType,
        entryPoint: options.entryPoint,
        salt: options.salt,
      });
      const response = await manager.sendUserOperation(config, calls, opts);
      if (disposed || own !== requestId) return null;
      isEstimating.value = false;
      userOpHash.value = response.userOpHash;
      void manager
        .getUserOperationReceipt(response.userOpHash)
        .then((next) => {
          if (!disposed && own === requestId) receipt.value = next;
        })
        .catch(() => undefined);
      return response;
    } catch (cause) {
      if (disposed || own !== requestId) return null;
      return fail(
        cause instanceof Error
          ? cause
          : new Error("Failed to send UserOperation"),
      );
    } finally {
      inFlight = false;
      if (!disposed && own === requestId) {
        isPending.value = false;
        isEstimating.value = false;
      }
    }
  };

  /**
   * Clears published state and drops the in-flight operation's future
   * writes. Deliberately does not unlock single-flight: the operation may
   * still be signing or broadcasting, and a second sendUserOp meanwhile
   * would be a second on-chain side effect.
   */
  const reset = (): void => {
    requestId++;
    userOpHash.value = null;
    receipt.value = null;
    isPending.value = false;
    isEstimating.value = false;
    error.value = null;
  };

  onScopeDispose(() => {
    disposed = true;
    requestId++;
  });

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
