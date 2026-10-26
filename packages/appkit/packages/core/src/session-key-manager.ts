import {
  DEFAULT_SESSION_KEY_CONFIG,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SessionKeyManager,
  type SessionKeyManagerConfig,
  WalletError,
} from "@naculus/connect-core";

/**
 * One process-wide SessionKeyManager shared by the React hooks and the Vue
 * composables. The manager owns encrypted key material and spending budgets,
 * so two instances with different limits in one page would let a caller
 * operate under limits it did not set; a second, different configuration is
 * refused rather than silently ignored.
 */

let sharedManager: SessionKeyManager | null = null;
let sharedFingerprint: string | null = null;

/** The subset of the config that changes what a key may spend or how it is sealed. */
export function sessionKeyConfigFingerprint(
  config?: SessionKeyManagerConfig,
): string {
  if (!config) return "";
  return JSON.stringify({
    defaultMaxTotalValue: config.defaultMaxTotalValue?.toString(),
    defaultMaxTxCount: config.defaultMaxTxCount,
    defaultExpiryMs: config.defaultExpiryMs,
    requireAllowedContracts: config.requireAllowedContracts,
    forbiddenMethods: config.forbiddenMethods,
    pbkdf2Iterations: config.pbkdf2Iterations,
    unsafeAllowWeakKdf: config.unsafeAllowWeakKdf,
    storagePrefix: config.storagePrefix,
    encryptionKey: config.encryptionKey,
    encryptionSalt: config.encryptionSalt,
  });
}

export function getSharedSessionKeyManager(
  config?: SessionKeyManagerConfig,
): SessionKeyManager {
  const fingerprint = sessionKeyConfigFingerprint(config);
  if (!sharedManager) {
    const storagePrefix =
      config?.storagePrefix ?? DEFAULT_SESSION_KEY_CONFIG.storagePrefix;
    sharedManager = new SessionKeyManager(
      config,
      typeof window !== "undefined"
        ? new LocalStorageAdapter(`${storagePrefix}:`)
        : new MemoryStorageAdapter(),
    );
    sharedFingerprint = fingerprint;
    return sharedManager;
  }
  if (fingerprint !== "" && fingerprint !== sharedFingerprint) {
    throw new WalletError(
      "invalid_input",
      "useSessionKeys is backed by a process-wide SessionKeyManager, and a " +
        "different spending configuration was supplied after it was created. " +
        "The second configuration would be ignored, so the caller would be " +
        "operating under limits it did not set. Use one configuration per " +
        "application, or construct a SessionKeyManager directly.",
    );
  }
  return sharedManager;
}

/** Drop the shared instance. For tests and for a full sign-out that must forget keys. */
export function resetSharedSessionKeyManager(): void {
  sharedManager = null;
  sharedFingerprint = null;
}
