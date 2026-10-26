import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useEmbeddedWallet } from "./useEmbeddedWallet";

describe("useEmbeddedWallet", () => {
  it("delegates sensitive inputs and results without retaining them", async () => {
    const wallet = ref(null);
    const importFromMnemonic = vi.fn().mockResolvedValue({ id: "wallet" });
    const importFromPrivateKey = vi
      .fn()
      .mockResolvedValue({ id: "key-wallet" });
    const getSeedPhrase = vi.fn(() => "seed words");
    const getPrivateKey = vi.fn(() => "0xprivate");
    const scope = effectScope();
    const state = scope.run(() =>
      useEmbeddedWallet({
        wallet,
        backupPending: false,
        storageSecurityLevel: 1,
        securityReport: null,
        connectEmbedded: vi.fn().mockResolvedValue(undefined),
        restoreWallet: vi.fn().mockResolvedValue(false),
        generateWallet: vi.fn().mockResolvedValue(null),
        importFromMnemonic,
        importFromPrivateKey,
        wipe: vi.fn().mockResolvedValue(undefined),
        setActiveNamespace: vi.fn<(namespace: string) => void>(),
        backfillAccounts: vi.fn().mockResolvedValue([]),
        getSeedPhrase,
        getPrivateKey,
        confirmBackup: vi.fn<() => void>(),
      }),
    )!;
    const mnemonic = "exact seed phrase";
    const privateKey = "0xexact-private-key";
    await expect(state.importFromMnemonic(mnemonic)).resolves.toEqual({
      id: "wallet",
    });
    await expect(state.importFromPrivateKey(privateKey)).resolves.toEqual({
      id: "key-wallet",
    });
    expect(importFromMnemonic).toHaveBeenCalledWith(mnemonic);
    expect(importFromPrivateKey).toHaveBeenCalledWith(privateKey);
    expect(state.getSeedPhrase()).toBe("seed words");
    expect(state.getPrivateKey()).toBe("0xprivate");
    expect(state.wallet.value).toBeNull();
    scope.stop();
  });
});
