// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Need vi.hoisted because vi.mock is hoisted above variable declarations
const {
  mockWalletConnectConnector,
  mockEmbeddedConnector,
  mockSolanaConnector,
} = vi.hoisted(() => {
  const wc = {
    id: "walletconnect",
    name: "WalletConnect",
    kind: "walletconnect",
    connect: vi.fn().mockResolvedValue({ id: "wc-session" }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue({ id: "wc-session" }),
    startPairing: vi.fn().mockResolvedValue("wc://uri?key=test"),
    completePairing: vi.fn().mockResolvedValue({ id: "wc-session" }),
    switchChain: vi.fn().mockResolvedValue(undefined),
    getAccounts: vi.fn().mockResolvedValue([]),
    signMessage: vi.fn(),
    getCapabilities: vi.fn().mockResolvedValue({
      "eip155:1": { atomicBatch: { supported: true } },
    }),
    onAccountsChanged: vi.fn().mockReturnValue(() => {}),
    onChainChanged: vi.fn().mockReturnValue(() => {}),
  };

  const embedded = {
    id: "embedded",
    name: "Embedded Wallet",
    kind: "embedded",
    connect: vi
      .fn()
      .mockResolvedValue({ id: "embedded-session", walletType: "embedded" }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getAccounts: vi.fn().mockResolvedValue([]),
    signMessage: vi.fn().mockResolvedValue("embedded-signature"),
    sendTransaction: vi.fn().mockResolvedValue("embedded-tx-hash"),
    sendCalls: vi.fn().mockResolvedValue("embedded-bundle-id"),
    getCapabilities: vi.fn().mockResolvedValue({}),
    onAccountsChanged: vi.fn().mockReturnValue(() => {}),
  };

  const solana = {
    onAccountsChanged: vi.fn().mockReturnValue(() => {}),
    onChainChanged: vi.fn().mockReturnValue(() => {}),
    id: "solana",
    name: "Solana",
    kind: "solana" as const,
    connect: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn(),
    startPairing: vi.fn(),
    completePairing: vi.fn(),
    switchChain: vi.fn(),
    getAccounts: vi.fn().mockResolvedValue([]),
    signMessage: vi.fn().mockResolvedValue("signed-message"),
    sendTransaction: vi.fn().mockResolvedValue("tx-hash"),
  };

  return {
    mockWalletConnectConnector: wc,
    mockEmbeddedConnector: embedded,
    mockSolanaConnector: solana,
  };
});

vi.mock("@naculus/connector-walletconnect", () => ({
  createWalletConnectConnector: vi.fn(() => mockWalletConnectConnector),
  WalletConnectConnector: vi.fn(),
}));

vi.mock("@naculus/connector-embedded", () => ({
  createPocketConnector: vi.fn(() => mockEmbeddedConnector),
}));

vi.mock("@naculus/connector-solana", () => ({
  solanaConnector: mockSolanaConnector,
}));

import { clearClient, createClient, getClient } from "./client";

const defaultConfig = {
  projectId: "test-project-id",
  metadata: {
    name: "Test App",
    description: "Test Description",
    url: "https://test.com",
    icons: ["https://test.com/icon.png"],
  },
};

describe("createClient", () => {
  beforeEach(() => {
    clearClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearClient();
  });

  describe("basic client", () => {
    it("should create a client", () => {
      const client = createClient(defaultConfig);
      expect(client).toBeDefined();
      expect(client.connector).toBeDefined();
    });

    it("should create an isolated client for each provider", () => {
      const client1 = createClient(defaultConfig);
      const client2 = createClient(defaultConfig);
      expect(client1).not.toBe(client2);
    });

    it("getClient should return null before creation", () => {
      expect(getClient()).toBeNull();
    });

    it("getClient should return instance after creation", () => {
      const client = createClient(defaultConfig);
      expect(getClient()).toBe(client);
    });

    it("clearClient allows fresh instance", () => {
      const client1 = createClient(defaultConfig);
      clearClient();
      expect(getClient()).toBeNull();
      const client2 = createClient(defaultConfig);
      expect(client2).not.toBe(client1);
    });

    it("should delegate connect() to WalletConnect", async () => {
      const client = createClient(defaultConfig);
      const session = await client.connect();
      expect(mockWalletConnectConnector.connect).toHaveBeenCalledOnce();
      expect(session).toEqual({ id: "wc-session" });
    });

    it("should delegate disconnect()", async () => {
      const client = createClient(defaultConfig);
      const session = { id: "test" } as any;
      await client.disconnect(session);
      expect(mockWalletConnectConnector.disconnect).toHaveBeenCalledWith(
        session,
      );
    });

    it("should delegate reconnect()", async () => {
      const client = createClient(defaultConfig);
      const session = { id: "test" } as any;
      const result = await client.reconnect(session);
      expect(mockWalletConnectConnector.reconnect).toHaveBeenCalledWith(
        session,
      );
      expect(result).toEqual({ id: "wc-session" });
    });

    it("should delegate startPairing/completePairing", async () => {
      const client = createClient(defaultConfig);
      const uri = await client.startPairing();
      expect(uri).toBe("wc://uri?key=test");
      expect(await client.completePairing()).toEqual({ id: "wc-session" });
    });

    it("should throw on connectEmbedded when not enabled", async () => {
      const client = createClient(defaultConfig);
      await expect(client.connectEmbedded()).rejects.toThrow("not enabled");
    });

    it("should return 1 connector from getAllConnectors", () => {
      const client = createClient(defaultConfig);
      expect(client.getAllConnectors()).toHaveLength(1);
    });
  });

  describe("with Embedded Wallet enabled", () => {
    it("should connect embedded wallet", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });
      const session = await client.connectEmbedded();
      expect(session).toEqual({
        id: "embedded-session",
        walletType: "embedded",
      });
    });

    it("should set embeddedConnector after connect", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });
      await client.connectEmbedded();
      expect(client.embeddedConnector).not.toBeNull();
      expect(client.embeddedConnector!.id).toBe("embedded");
    });

    it("should expose the embedded connector after lazy initialization", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });

      await expect(client.getEmbeddedConnector()).resolves.toBe(
        mockEmbeddedConnector,
      );
    });

    it("should include embedded in getAllConnectors", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });
      await client.connectEmbedded();
      const connectors = client.getAllConnectors();
      expect(connectors.find((c) => c.kind === "embedded")).toBeDefined();
    });

    it("routes signing and transactions to the embedded connector", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });
      const session = await client.connectEmbedded();
      const input = { message: "hello" };
      const tx = { transaction: { to: "0x1234" }, chainId: "eip155:1" };

      await expect(client.signMessage(session, input)).resolves.toBe(
        "embedded-signature",
      );
      await expect(client.sendTransaction(session, tx)).resolves.toBe(
        "embedded-tx-hash",
      );
      expect(mockEmbeddedConnector.signMessage).toHaveBeenCalledWith(
        session,
        input,
      );
      expect(mockEmbeddedConnector.sendTransaction).toHaveBeenCalledWith(
        session,
        tx,
      );
    });
  });

  describe("with Solana enabled", () => {
    it("signMessage routes to solana connector", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      const result = await client.signMessage(session, { message: "hello" });

      expect(mockSolanaConnector.signMessage).toHaveBeenCalledWith(session, {
        message: "hello",
      });
      expect(result).toBe("signed-message");
    });

    it("signMessage awaits solanaInit before routing", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: true });

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      const result = await client.signMessage(session, { message: "hello" });

      expect(mockSolanaConnector.signMessage).toHaveBeenCalled();
      expect(result).toBe("signed-message");
      expect(client.solanaConnector).toBe(mockSolanaConnector);
    });

    it("signMessage with no solana connector throws WalletError", async () => {
      const client = createClient(defaultConfig);

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      await expect(
        client.signMessage(session, { message: "hello" }),
      ).rejects.toThrow("Solana connector not available");
    });

    it("sendTransaction routes to solana connector", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      const tx = { transaction: { from: "abc" } };
      const result = await client.sendTransaction(session, tx);

      expect(mockSolanaConnector.sendTransaction).toHaveBeenCalledWith(
        session,
        tx,
      );
      expect(result).toBe("tx-hash");
    });

    it("disconnect routes to solana connector", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      await client.disconnect(session);

      expect(mockSolanaConnector.disconnect).toHaveBeenCalledWith(session);
    });

    it("reconnect with solana walletType returns session as-is", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);

      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      const result = await client.reconnect(session);

      expect(result).toBe(session);
    });
  });

  /**
   * Capability dispatch.
   *
   * getCapabilities has to route exactly like sendCalls. If the answer comes
   * from one connector and the send goes through another, the caller is
   * promised atomicity the executing wallet never claimed. The undefined
   * return is load-bearing: it means "this connector cannot be asked", which
   * getAccountCapabilities reports as discovered: false rather than as a no.
   */
  describe("getCapabilities dispatch", () => {
    it("routes a WalletConnect session to the WalletConnect connector", async () => {
      const client = createClient(defaultConfig);
      const session = {
        id: "wc-session",
        walletType: "walletconnect",
        namespaces: {},
      } as any;
      const caps = await client.getCapabilities!(session);
      expect(mockWalletConnectConnector.getCapabilities).toHaveBeenCalledWith(
        session,
      );
      expect(caps!["eip155:1"].atomicBatch.supported).toBe(true);
    });

    it("routes an embedded session to the embedded connector", async () => {
      const client = createClient({ ...defaultConfig, enableEmbedded: true });
      client._setEmbeddedConnector(mockEmbeddedConnector as any);
      const session = {
        id: "embedded-session",
        walletType: "embedded",
        namespaces: {},
      } as any;
      await client.getCapabilities!(session);
      expect(mockEmbeddedConnector.getCapabilities).toHaveBeenCalled();
      expect(mockWalletConnectConnector.getCapabilities).not.toHaveBeenCalled();
    });

    it("reports undefined for a connector that cannot answer", async () => {
      // Not an empty object: a Solana connector with no implementation has not
      // said the account lacks the capability, it has said nothing.
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);
      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      expect(await client.getCapabilities!(session)).toBeUndefined();
    });

    it("does not ask WalletConnect about a session it is not carrying", async () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);
      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      await client.getCapabilities!(session);
      expect(mockWalletConnectConnector.getCapabilities).not.toHaveBeenCalled();
    });
  });

  /**
   * Wallet-initiated account and chain changes.
   *
   * Subscription used to live in the React provider, which reached through
   * `eip6963Connector.getDiscoveredWallets()` into the raw EIP-1193 provider.
   * That worked for injected EVM wallets and nothing else: a Solana or
   * WalletConnect account switch was never noticed, and the provider
   * re-implemented CAIP-10 re-keying the connector already did. Routing it
   * through the connector is what makes it work for every namespace.
   */
  describe("onAccountsChanged dispatch", () => {
    it("routes a WalletConnect session to the WalletConnect connector", () => {
      const client = createClient(defaultConfig);
      const session = {
        id: "wc-session",
        walletType: "walletconnect",
        namespaces: {},
      } as any;
      const handler = vi.fn();
      client.onAccountsChanged!(session, handler);
      expect(mockWalletConnectConnector.onAccountsChanged).toHaveBeenCalledWith(
        session,
        handler,
      );
    });

    it("routes a Solana session to the Solana connector", () => {
      const client = createClient({ ...defaultConfig, enableSolana: false });
      client._setSolanaConnector(mockSolanaConnector as any);
      const session = {
        walletType: "solana",
        id: "sol-session",
        namespaces: {},
      } as any;
      const handler = vi.fn();
      client.onAccountsChanged!(session, handler);
      expect(mockSolanaConnector.onAccountsChanged).toHaveBeenCalled();
      expect(
        mockWalletConnectConnector.onAccountsChanged,
      ).not.toHaveBeenCalled();
    });

    it("returns a callable unsubscribe even when nothing can report", () => {
      // The caller passes the result straight to useEffect's cleanup slot, so
      // undefined here would crash on unmount.
      const client = createClient(defaultConfig);
      const session = {
        walletType: "passkeys",
        id: "pk",
        namespaces: {},
      } as any;
      const unsubscribe = client.onAccountsChanged!(session, vi.fn());
      expect(unsubscribe).toBeTypeOf("function");
      expect(() => unsubscribe()).not.toThrow();
    });

    it("passes the connector's unsubscribe through", () => {
      const unsubscribe = vi.fn();
      mockWalletConnectConnector.onAccountsChanged.mockReturnValueOnce(
        unsubscribe,
      );
      const client = createClient(defaultConfig);
      const session = {
        id: "wc-session",
        walletType: "walletconnect",
        namespaces: {},
      } as any;
      client.onAccountsChanged!(session, vi.fn())();
      expect(unsubscribe).toHaveBeenCalled();
    });

    it("routes chain changes the same way", () => {
      const client = createClient(defaultConfig);
      const session = {
        id: "wc-session",
        walletType: "walletconnect",
        namespaces: {},
      } as any;
      const handler = vi.fn();
      client.onChainChanged!(session, handler);
      expect(mockWalletConnectConnector.onChainChanged).toHaveBeenCalledWith(
        session,
        handler,
      );
    });
  });
});

describe("createClient — React Native wiring", () => {
  beforeEach(() => {
    clearClient();
    vi.clearAllMocks();
  });

  it("passes an app-built SignClient and deep-link opener to WalletConnect", async () => {
    const { createWalletConnectConnector } = await import(
      "@naculus/connector-walletconnect"
    );
    const signClient = { core: {} };
    const openUrl = vi.fn();
    createClient({
      ...defaultConfig,
      walletConnect: { client: signClient, openUrl },
    });
    expect(createWalletConnectConnector).toHaveBeenCalledWith(
      expect.objectContaining({ client: signClient, openUrl }),
    );
  });

  it("leaves WalletConnect as before when nothing is supplied", async () => {
    const { createWalletConnectConnector } = await import(
      "@naculus/connector-walletconnect"
    );
    createClient(defaultConfig);
    const arg = vi.mocked(createWalletConnectConnector).mock.calls[0]?.[0];
    expect(arg).not.toHaveProperty("client");
    expect(arg).not.toHaveProperty("openUrl");
  });

  it("registers app-held Solana wallets once the connector loads", async () => {
    const registerWallet = vi.fn();
    (mockSolanaConnector as Record<string, unknown>).registerWallet =
      registerWallet;
    const wallet = { name: "Mobile Wallet Adapter" };
    const client = createClient({
      ...defaultConfig,
      enableSolana: true,
      solanaWallets: [wallet],
    });
    await client.signMessage(
      { walletType: "solana", id: "s", namespaces: {} } as never,
      { message: "x" },
    );
    expect(registerWallet).toHaveBeenCalledWith(wallet);
    delete (mockSolanaConnector as Record<string, unknown>).registerWallet;
  });

  it("registers app-held EIP-1193 providers as injected wallets", async () => {
    const { eip6963Connector } = await import(
      "@naculus/connector-evm-injected"
    );
    const info = {
      uuid: "coinbase-mwp",
      name: "Coinbase Wallet",
      icon: "data:,",
      rdns: "com.coinbase.wallet",
    };
    const provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    createClient({ ...defaultConfig, injectedProviders: [{ info, provider }] });
    expect(
      eip6963Connector.getDiscoveredWallets().find((w) => w.id === info.uuid)
        ?.provider,
    ).toBe(provider);
    eip6963Connector.clear();
  });
});
