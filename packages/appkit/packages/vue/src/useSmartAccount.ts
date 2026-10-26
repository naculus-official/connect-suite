import {
  bareEvmAddress,
  buildSmartAccountConfig,
  resolveEvmChainId,
  type SmartAccountType,
} from "@naculus/connect-appkit-core";
import type {
  Address,
  SmartAccountConfig,
  SmartAccountInfo,
  SmartAccountManager,
} from "@naculus/connect-core";
import { WalletError } from "@naculus/connect-core";
import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import {
  computed,
  onScopeDispose,
  shallowRef,
  toValue,
  unref,
  watch,
} from "vue";
import { useActionGuard } from "./internal/action-guard";

/** What deployWallet needs from the caller: something that sends an EVM transaction. */
export type DeployTransactionSender = (transaction: {
  to: Address;
  data: `0x${string}`;
  value: string;
  chainId: string;
}) => Promise<Address>;

export interface UseSmartAccountOptions {
  /** Connected EOA (plain or CAIP-10); becomes the smart-account owner. */
  account: MaybeRefOrGetter<string | null | undefined>;
  /** Connected chain (CAIP-2), if any. */
  connectedChainId: MaybeRefOrGetter<string | null | undefined>;
  rpcUrl: MaybeRefOrGetter<string | undefined>;
  bundlerUrl?: MaybeRefOrGetter<string | undefined>;
  chainId?: MaybeRefOrGetter<string | undefined>;
  entryPoint?: Address;
  accountType?: SmartAccountType;
  salt?: bigint;
  /** Required for deployWallet; the connected wallet's sendTransaction. */
  sendTransaction?: MaybeRef<DeployTransactionSender | null | undefined>;
  /** Reuse a caller-owned manager instead of constructing one. */
  manager?: MaybeRefOrGetter<SmartAccountManager | null | undefined>;
}

export interface UseSmartAccountReturn {
  address: ShallowRef<Address | null>;
  isDeployed: ShallowRef<boolean>;
  accountInfo: ShallowRef<SmartAccountInfo | null>;
  isLoading: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  /** Null until rpcUrl, chain and owner are all known. */
  config: ComputedRef<SmartAccountConfig | null>;
  createWallet: () => Promise<SmartAccountInfo | null>;
  deployWallet: () => Promise<Address | null>;
  getAddress: () => Promise<Address | null>;
}

/**
 * Counterfactual smart-account address, deployment state and deployment,
 * mirroring the React hook. Address derivation, factory calldata and the
 * refusal to broadcast from the manager are connect-core's; chain and
 * config decisions are appkit-core's. Deployment is sent through the
 * caller's own transaction sender, never by this composable.
 */
export function useSmartAccount(
  options: UseSmartAccountOptions,
): UseSmartAccountReturn {
  const address = shallowRef<Address | null>(null);
  const isDeployed = shallowRef(false);
  const accountInfo = shallowRef<SmartAccountInfo | null>(null);
  const guard = useActionGuard();
  const managerRef = shallowRef<SmartAccountManager | null>(null);
  let generation = 0;
  let inFlight = false;
  let disposed = false;

  const chainId = computed(() =>
    resolveEvmChainId(
      toValue(options.chainId),
      toValue(options.connectedChainId),
    ),
  );

  // Build (or adopt) the manager when its inputs change; a stale async
  // import result must not overwrite a newer manager.
  watch(
    [
      () => toValue(options.manager),
      () => toValue(options.rpcUrl),
      () => toValue(options.bundlerUrl),
      () => chainId.value,
    ],
    ([supplied, rpcUrl, bundlerUrl, chain]) => {
      const own = ++generation;
      managerRef.value = null;
      if (supplied) {
        managerRef.value = supplied;
        return;
      }
      if (!rpcUrl || !chain) return;
      import("@naculus/connect-core")
        .then(({ SmartAccountManager }) => {
          if (disposed || own !== generation) return;
          managerRef.value = new SmartAccountManager({
            rpcUrl,
            chainId: chain,
            bundlerClient: { url: bundlerUrl ?? "" },
          });
        })
        .catch((cause) => {
          if (disposed || own !== generation) return;
          guard.error.value =
            cause instanceof Error
              ? cause
              : new Error("Failed to load account-abstraction module");
        });
    },
    { immediate: true },
  );

  const config = computed<SmartAccountConfig | null>(() => {
    const owner = bareEvmAddress(toValue(options.account));
    const chain = chainId.value;
    if (!owner || !chain || !managerRef.value) return null;
    return buildSmartAccountConfig(owner, chain, {
      accountType: options.accountType,
      entryPoint: options.entryPoint,
      salt: options.salt,
    });
  });

  const apply = (info: SmartAccountInfo): void => {
    address.value = info.address;
    isDeployed.value = info.isDeployed;
    accountInfo.value = info;
  };

  /**
   * One account operation at a time. State is written only through `commit`,
   * which is a no-op once the config, manager or scope that started the
   * operation has been replaced — so a slow result for a previous account or
   * chain cannot overwrite the current one, not even briefly.
   */
  const operate = async <T>(
    action: (
      manager: SmartAccountManager,
      cfg: SmartAccountConfig,
      commit: (write: () => void) => void,
    ) => Promise<T>,
    fallback: string,
  ): Promise<T | null> => {
    const cfg = config.value;
    const manager = managerRef.value;
    if (!cfg || !manager) {
      guard.error.value = new Error("Smart account not configured");
      return null;
    }
    if (inFlight) {
      guard.error.value = new Error(
        "Smart account operation already in progress",
      );
      return null;
    }
    inFlight = true;
    const own = generation;
    const current = () => !disposed && own === generation;
    const commit = (write: () => void): void => {
      if (current()) write();
    };
    try {
      return await guard.run(async () => {
        const result = await action(manager, cfg, commit);
        return current() ? result : null;
      }, fallback);
    } catch {
      return null;
    } finally {
      inFlight = false;
    }
  };

  const createWallet = () =>
    operate(async (manager, cfg, commit) => {
      const info = await manager.createAccount(cfg);
      commit(() => apply(info));
      return info;
    }, "Failed to create smart account");

  const deployWallet = () =>
    operate(async (manager, cfg, commit) => {
      const send = unref(options.sendTransaction);
      if (!send) {
        throw new WalletError(
          "wallet_unavailable",
          "deployWallet needs the connected wallet's sendTransaction",
        );
      }
      const before = await manager.createAccount(cfg);
      if (before.isDeployed) {
        commit(() => apply(before));
        return before.address;
      }
      // Manager builds the factory call; the caller's wallet broadcasts it.
      const deployTx = await manager.getDeployCallData(cfg);
      const hash = await send({
        to: deployTx.to,
        data: deployTx.data,
        value: deployTx.value.toString(),
        chainId: cfg.chainId,
      });
      const after = await manager.createAccount(cfg);
      commit(() => apply(after));
      return hash;
    }, "Failed to deploy smart account");

  const getAddress = () =>
    operate(async (manager, cfg, commit) => {
      const addr = await manager.getAccountAddress(cfg);
      commit(() => {
        address.value = addr;
      });
      return addr;
    }, "Failed to get smart account address");

  onScopeDispose(() => {
    disposed = true;
    generation++;
  });

  return {
    address,
    isDeployed,
    accountInfo,
    isLoading: guard.busy,
    error: guard.error,
    config,
    createWallet,
    deployWallet,
    getAddress,
  };
}
