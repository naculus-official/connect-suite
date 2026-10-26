/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEmbeddedWallet } from "./useEmbeddedWallet";

// -- Mocks --

const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
  Web3ConnectProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const mockGetClient = vi.fn();
vi.mock("../client", () => ({
  getClient: () => mockGetClient(),
}));

const mockConnector = {
  load: vi.fn(),
  getWallet: vi.fn(),
  generateWallet: vi.fn(),
  importFromMnemonic: vi.fn(),
  importFromPrivateKey: vi.fn(),
  wipe: vi.fn(),
};

function mockStandardEmbedded() {
  mockGetClient.mockReturnValue({
    embeddedConnector: mockConnector,
    getEmbeddedConnector: vi.fn().mockResolvedValue(mockConnector),
  });
}

describe("useEmbeddedWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnector.load.mockReset().mockResolvedValue(false);
    mockConnector.getWallet.mockReset().mockReturnValue(null);
    mockStandardEmbedded();
  });

  it("should have initial idle state", () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    expect(result.current.hasWallet).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.seedPhrase).toBeNull();
    expect(result.current.backupPending).toBe(false);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("restores a persisted wallet on mount without re-exposing its mnemonic", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });
    const persistedWallet = {
      mnemonic: "persisted recovery phrase",
      privateKey: "0xpersisted",
      address: "0xpersistedAddress",
    };
    mockConnector.load.mockResolvedValue(true);
    mockConnector.getWallet.mockReturnValue(persistedWallet);

    const { result } = renderHook(() => useEmbeddedWallet());

    await waitFor(() => {
      expect(result.current.address).toBe(persistedWallet.address);
    });
    expect(result.current.hasWallet).toBe(true);
    expect(result.current.seedPhrase).toBeNull();
    expect(result.current.backupPending).toBe(false);
    expect(result.current.wallet).not.toHaveProperty("mnemonic");
    expect(result.current.wallet).not.toHaveProperty("privateKey");
  });

  it("waits for the lazy embedded connector before restoring", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });
    const persistedWallet = {
      mnemonic: "persisted recovery phrase",
      privateKey: "0xpersisted",
      address: "0xlazyAddress",
    };
    mockConnector.load.mockResolvedValue(true);
    mockConnector.getWallet.mockReturnValue(persistedWallet);
    mockGetClient.mockReturnValue({
      embeddedConnector: null,
      getEmbeddedConnector: vi.fn().mockResolvedValue(mockConnector),
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    await waitFor(() => {
      expect(result.current.address).toBe(persistedWallet.address);
    });
    expect(mockConnector.load).toHaveBeenCalledOnce();
  });

  it("waits for the lazy embedded connector before generating a wallet", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });
    const generatedWallet = {
      mnemonic: "test test test test test test test test test test test junk",
      privateKey: `0x${"12".repeat(32)}`,
      address: "0x1234567890123456789012345678901234567890",
      createdAt: 1,
    };
    mockConnector.generateWallet.mockResolvedValue(generatedWallet);
    let releaseConnector: ((connector: typeof mockConnector) => void) | null =
      null;
    const readyConnector = new Promise<typeof mockConnector>((resolve) => {
      releaseConnector = resolve;
    });
    mockGetClient.mockReturnValue({
      embeddedConnector: null,
      getEmbeddedConnector: vi.fn(() => readyConnector),
    });

    const { result } = renderHook(() => useEmbeddedWallet());
    let generation: Promise<unknown> | null = null;
    act(() => {
      generation = result.current.generateWallet();
    });
    expect(mockConnector.generateWallet).not.toHaveBeenCalled();

    await act(async () => {
      releaseConnector?.(mockConnector);
      await generation;
    });
    expect(mockConnector.generateWallet).toHaveBeenCalledOnce();
    expect(result.current.address).toBe(generatedWallet.address);
  });

  it("retries one transient empty load during mount", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });
    const persistedWallet = {
      mnemonic: "persisted recovery phrase",
      privateKey: "0xpersisted",
      address: "0xretryOnMount",
    };
    mockConnector.load.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockConnector.getWallet.mockReturnValue(persistedWallet);

    const { result } = renderHook(() => useEmbeddedWallet());

    await waitFor(() => {
      expect(result.current.address).toBe(persistedWallet.address);
    });
    expect(mockConnector.load).toHaveBeenCalledTimes(2);
  });

  it("can retry restoration without creating or connecting a wallet", async () => {
    const providerConnect = vi.fn();
    mockUseWeb3.mockReturnValue({
      connectEmbedded: providerConnect,
      status: "disconnected",
    });
    const persistedWallet = {
      mnemonic: "persisted recovery phrase",
      privateKey: "0xpersisted",
      address: "0xretryAddress",
    };
    mockConnector.load.mockResolvedValueOnce(false);

    const { result } = renderHook(() => useEmbeddedWallet());
    await waitFor(() => expect(mockConnector.load).toHaveBeenCalledOnce());

    mockConnector.load.mockResolvedValueOnce(true);
    mockConnector.getWallet.mockReturnValue(persistedWallet);
    await act(async () => {
      await expect(result.current.restoreWallet()).resolves.toBe(true);
    });

    expect(result.current.address).toBe(persistedWallet.address);
    expect(providerConnect).not.toHaveBeenCalled();
    expect(mockConnector.generateWallet).not.toHaveBeenCalled();
  });

  it("connectEmbedded should call provider and set wallet", async () => {
    const providerConnect = vi.fn().mockResolvedValue(undefined);
    mockUseWeb3.mockReturnValue({
      connectEmbedded: providerConnect,
      status: "disconnected",
    });

    const fakeWallet = {
      mnemonic: "test mnemonic phrase",
      privateKey: "0xfake",
      address: "0xfakeAddress",
    };

    mockConnector.load.mockResolvedValue(false);
    mockConnector.getWallet.mockReturnValue(fakeWallet);

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.connectEmbedded();
    });

    expect(providerConnect).toHaveBeenCalled();
    expect(mockConnector.getWallet).toHaveBeenCalled();
    expect(result.current.wallet).toEqual({
      accounts: [{ namespace: "eip155", address: "0xfakeAddress" }],
      activeNamespace: "eip155",
      createdAt: 0,
      recoveryAvailable: true,
      address: "0xfakeAddress",
    });
    expect(result.current.hasWallet).toBe(true);
    expect(result.current.address).toBe("0xfakeAddress");
    expect(result.current.isBusy).toBe(false);
  });

  it("generateWallet should create a new wallet and set backup pending", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    const newWallet = {
      mnemonic: "actual random mnemonic",
      privateKey: "0xnewPrivateKey",
      address: "0xnewAddress",
    };

    mockConnector.generateWallet.mockResolvedValue({
      mnemonic: newWallet.mnemonic,
      privateKey: newWallet.privateKey,
      address: newWallet.address,
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.generateWallet();
    });

    expect(mockConnector.generateWallet).toHaveBeenCalled();
    expect(result.current.wallet).not.toHaveProperty("mnemonic");
    expect(result.current.wallet).not.toHaveProperty("privateKey");
    expect(result.current.seedPhrase).toBe(newWallet.mnemonic);
    expect(result.current.backupPending).toBe(true);
    expect(result.current.isBusy).toBe(false);
  });

  it("importFromMnemonic should import from seed phrase", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    const imported = {
      mnemonic: "",
      privateKey: "0ximportedKey",
      address: "0ximportedAddr",
    };

    mockConnector.importFromMnemonic.mockResolvedValue({
      mnemonic: imported.mnemonic,
      privateKey: imported.privateKey,
      address: imported.address,
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.importFromMnemonic("my seed phrase");
    });

    expect(mockConnector.importFromMnemonic).toHaveBeenCalledWith(
      "my seed phrase",
    );
    expect(result.current.wallet).not.toHaveProperty("mnemonic");
    expect(result.current.wallet).not.toHaveProperty("privateKey");
    expect(result.current.seedPhrase).toBeNull();
    expect(result.current.backupPending).toBe(false);
  });

  it("wipe should clear wallet and seed phrase", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    mockConnector.getWallet.mockReturnValue({
      mnemonic: "some mnemonic",
      privateKey: "0xpk",
      address: "0xaddr",
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.wipe();
    });

    expect(mockConnector.wipe).toHaveBeenCalled();
    expect(result.current.hasWallet).toBe(false);
    expect(result.current.seedPhrase).toBeNull();
    expect(result.current.backupPending).toBe(false);
  });

  it("confirmBackup should clear seed phrase from react state", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    mockConnector.getWallet.mockReturnValue({
      mnemonic: "some mnemonic",
      privateKey: "0xpk",
      address: "0xaddr",
    });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.connectEmbedded();
    });

    act(() => {
      result.current.confirmBackup();
    });

    expect(result.current.seedPhrase).toBeNull();
    expect(result.current.backupPending).toBe(false);
  });

  it("should handle error when embedded not enabled", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    mockGetClient.mockReturnValue({ embeddedConnector: null });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.connectEmbedded();
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.isBusy).toBe(false);
  });

  it("clearError should reset error state", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    mockGetClient.mockReturnValue({ embeddedConnector: null });

    const { result } = renderHook(() => useEmbeddedWallet());

    await act(async () => {
      await result.current.connectEmbedded();
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it("clears a previous restore error after a successful retry", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });
    mockConnector.load.mockRejectedValueOnce(new Error("storage unavailable"));

    const { result } = renderHook(() => useEmbeddedWallet());
    await waitFor(() =>
      expect(result.current.error?.message).toBe("storage unavailable"),
    );

    mockConnector.load.mockResolvedValueOnce(true);
    mockConnector.getWallet.mockReturnValue({
      mnemonic: "persisted recovery phrase",
      accounts: [
        {
          namespace: "eip155",
          privateKey: "0xsecret",
          address: "0x1234567890123456789012345678901234567890",
        },
      ],
      activeNamespace: "eip155",
      createdAt: 1,
    });
    await act(async () => {
      await expect(result.current.restoreWallet()).resolves.toBe(true);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.wallet?.accounts[0]).toEqual({
      namespace: "eip155",
      address: "0x1234567890123456789012345678901234567890",
    });
    expect(result.current.wallet?.accounts[0]).not.toHaveProperty("privateKey");
  });

  it("should set isBusy during operations", async () => {
    mockUseWeb3.mockReturnValue({
      connectEmbedded: vi.fn(),
      status: "disconnected",
    });

    let resolveGen: (value: any) => void;
    const genPromise = new Promise<any>((resolve) => {
      resolveGen = resolve;
    });
    mockConnector.generateWallet.mockReturnValue(genPromise);

    const { result } = renderHook(() => useEmbeddedWallet());

    let callPromise: Promise<any>;
    act(() => {
      callPromise = result.current.generateWallet();
    });

    expect(result.current.isBusy).toBe(true);

    await act(async () => {
      resolveGen!({
        mnemonic: "test",
        privateKey: "0xtest",
        address: "0xtest",
      });
      await callPromise!;
    });

    expect(result.current.isBusy).toBe(false);
  });
});
