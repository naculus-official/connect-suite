import type { ComputedRef, MaybeRef, MaybeRefOrGetter, ShallowRef } from "vue";
import { computed, toValue, unref } from "vue";
import { useActionGuard } from "./internal/action-guard";

export interface EmbeddedWalletAccountView {
  namespace: string;
  address: string;
  derivationPath?: string;
}

export interface EmbeddedWalletView {
  accounts: EmbeddedWalletAccountView[];
  activeNamespace: string;
  createdAt: number;
  chainId?: string;
  version?: 2;
  recoveryAvailable: boolean;
  readonly address?: string;
}

export interface UseEmbeddedWalletOptions<TWalletData, TSecurityReport> {
  wallet: MaybeRefOrGetter<EmbeddedWalletView | null>;
  backupPending: MaybeRefOrGetter<boolean>;
  storageSecurityLevel: MaybeRefOrGetter<number>;
  securityReport: MaybeRefOrGetter<TSecurityReport | null>;
  connectEmbedded: MaybeRef<() => Promise<void>>;
  restoreWallet: MaybeRef<() => Promise<boolean>>;
  generateWallet: MaybeRef<() => Promise<TWalletData | null>>;
  importFromMnemonic: MaybeRef<
    (mnemonic: string) => Promise<TWalletData | null>
  >;
  importFromPrivateKey: MaybeRef<
    (privateKey: string) => Promise<TWalletData | null>
  >;
  wipe: MaybeRef<() => Promise<void>>;
  setActiveNamespace: MaybeRef<(namespace: string) => void>;
  backfillAccounts: MaybeRef<() => Promise<EmbeddedWalletAccountView[]>>;
  getSeedPhrase: MaybeRef<() => string | null>;
  getPrivateKey: MaybeRef<() => string | null>;
  confirmBackup: MaybeRef<() => void>;
}

export interface UseEmbeddedWalletReturn<TWalletData, TSecurityReport> {
  wallet: ComputedRef<EmbeddedWalletView | null>;
  hasWallet: ComputedRef<boolean>;
  address: ComputedRef<string | null>;
  accounts: ComputedRef<EmbeddedWalletAccountView[]>;
  activeNamespace: ComputedRef<string | null>;
  backupPending: ComputedRef<boolean>;
  storageSecurityLevel: ComputedRef<number>;
  securityReport: ComputedRef<TSecurityReport | null>;
  connectEmbedded: () => Promise<void>;
  restoreWallet: () => Promise<boolean>;
  generateWallet: () => Promise<TWalletData | null>;
  importFromMnemonic: (mnemonic: string) => Promise<TWalletData | null>;
  importFromPrivateKey: (privateKey: string) => Promise<TWalletData | null>;
  wipe: () => Promise<void>;
  setActiveNamespace: (namespace: string) => void;
  backfillAccounts: () => Promise<EmbeddedWalletAccountView[]>;
  getSeedPhrase: () => string | null;
  getPrivateKey: () => string | null;
  confirmBackup: () => void;
  isBusy: ShallowRef<boolean>;
  error: ShallowRef<Error | null>;
  clearError: () => void;
}

/** Reactive view over caller-owned embedded-wallet state and actions. */
export function useEmbeddedWallet<
  TWalletData = unknown,
  TSecurityReport = unknown,
>(
  options: UseEmbeddedWalletOptions<TWalletData, TSecurityReport>,
): UseEmbeddedWalletReturn<TWalletData, TSecurityReport> {
  const guard = useActionGuard();
  const run = <T>(action: () => Promise<T>): Promise<T> =>
    guard.run(action, "Embedded wallet action failed");
  const wallet = computed(() => toValue(options.wallet));
  return {
    wallet,
    hasWallet: computed(() => wallet.value !== null),
    address: computed(() => wallet.value?.address ?? null),
    accounts: computed(() => wallet.value?.accounts ?? []),
    activeNamespace: computed(() => wallet.value?.activeNamespace ?? null),
    backupPending: computed(() => toValue(options.backupPending)),
    storageSecurityLevel: computed(() => toValue(options.storageSecurityLevel)),
    securityReport: computed(() => toValue(options.securityReport)),
    connectEmbedded: () => run(() => unref(options.connectEmbedded)()),
    restoreWallet: () => run(() => unref(options.restoreWallet)()),
    generateWallet: () => run(() => unref(options.generateWallet)()),
    importFromMnemonic: (value) =>
      run(() => unref(options.importFromMnemonic)(value)),
    importFromPrivateKey: (value) =>
      run(() => unref(options.importFromPrivateKey)(value)),
    wipe: () => run(() => unref(options.wipe)()),
    setActiveNamespace: (value) => unref(options.setActiveNamespace)(value),
    backfillAccounts: () => run(() => unref(options.backfillAccounts)()),
    getSeedPhrase: () => unref(options.getSeedPhrase)(),
    getPrivateKey: () => unref(options.getPrivateKey)(),
    confirmBackup: () => unref(options.confirmBackup)(),
    isBusy: guard.busy,
    error: guard.error,
    clearError: guard.clearError,
  };
}
