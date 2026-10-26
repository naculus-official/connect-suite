/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type React from "react";

// ── Hoisted mocks ──────────────────────────────────────────────────

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    connect: vi.fn(),
    connectEmbedded: vi.fn(),
    connectPasskeys: vi.fn(),
    completePairing: vi.fn(),
    signMessage: vi.fn(),
    startPairing: vi.fn(),
    connector: { onSessionExpiry: vi.fn() },
    embeddedConnector: null,
    passkeysConnector: null,
    solanaConnector: null,
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    connectInjected: vi.fn(),
    getAllConnectors: vi.fn(() => []),
  },
}));

const { mockCreateSessionManager, mockSessionManager } = vi.hoisted(() => {
  const mockSessionManager = {
    on: vi.fn(),
    off: vi.fn(),
    attach: vi.fn(),
    registerConnector: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    restoreFromPersistence: vi.fn(),
    switchChain: vi.fn(),
    getActiveBundle: vi.fn(),
  };
  return {
    mockSessionManager,
    mockCreateSessionManager: vi.fn(() => mockSessionManager),
  };
});

vi.mock("../client", () => ({
  createClient: vi.fn(() => mockClient),
}));

vi.mock("@naculus/connector-evm-injected", () => ({
  eip6963Connector: { startDiscovery: vi.fn(), switchChain: vi.fn() },
}));

const { MockStorage } = vi.hoisted(() => {
  return {
    // An actual store, not three bare spies. `load` returning undefined meant
    // every reconnect took the "nothing saved" early return, so the reconnect
    // path was unreachable from this file — which is why SIWx being skipped
    // there went unnoticed.
    MockStorage: class {
      static saved: unknown = null;
      save = vi.fn(async (session: unknown) => {
        MockStorage.saved = session;
      });
      load = vi.fn(async () => MockStorage.saved);
      clear = vi.fn(async () => {
        MockStorage.saved = null;
      });
    },
  };
});

vi.mock("@naculus/connect-core", () => ({
  LocalStorageSessionStorage: MockStorage,
  createConnectorManager: vi.fn(() => ({ register: vi.fn() })),
  createSessionManager: mockCreateSessionManager,
  SessionManager: class {},
  ConnectorManager: class {},
  WalletError: class WalletError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message ?? code);
      this.name = "WalletError";
      this.code = code;
    }
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/chains", () => ({
  getDefaultChains: vi.fn(() => []),
}));

import { Web3ConnectProvider, useWeb3 } from "./Web3ConnectProvider";

// ── Fixtures ───────────────────────────────────────────────────────

const mockSession = {
  id: "test-session",
  walletType: "eip155",
  namespaces: {
    "eip155": {
      chains: ["eip155:1"],
      accounts: ["eip155:1:0x1234567890abcdef1234567890abcdef12345678"],
    },
  },
};

const siwxConfig = {
  createMessage: vi.fn().mockResolvedValue(
    "localhost wants you to sign in with your Ethereum account:\n" +
      "0x1234567890abcdef1234567890abcdef12345678\n\n" +
      "URI: https://test.com\n" +
      "Version: 1\n" +
      "Chain ID: eip155:1\n" +
      "Nonce: testnonce123\n" +
      "Issued At: 2026-08-26T00:00:00.000Z",
  ),
  handleSignComplete: vi.fn().mockResolvedValue(undefined),
  required: true,
};

const baseConfig = {
  projectId: "test-project-id",
  metadata: {
    name: "Test",
    description: "Test",
    url: "https://test.com",
    icons: ["https://test.com/icon.png"],
  },
};

function renderWithProvider(config: Record<string, unknown> = {}) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Web3ConnectProvider config={{ ...baseConfig, ...config } as any} autoConnect={false}>
      {children}
    </Web3ConnectProvider>
  );
  return renderHook(() => useWeb3(), { wrapper });
}

describe("Web3ConnectProvider — SIWx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connect.mockReset().mockResolvedValue(mockSession);
    mockClient.completePairing.mockReset().mockResolvedValue(mockSession);
    mockClient.signMessage.mockReset().mockResolvedValue("0xsignature");
  });

  it("runSiwx is called after successful connection when config.siwx is set", async () => {
    const { result } = renderWithProvider({ siwx: siwxConfig });

    await act(async () => {
      await result.current.connect();
    });

    expect(siwxConfig.createMessage).toHaveBeenCalledWith({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      chainId: "eip155:1",
    });
    expect(mockClient.signMessage).toHaveBeenCalled();
  });

  it("status becomes connected when SIWx succeeds", async () => {
    const { result } = renderWithProvider({ siwx: siwxConfig });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
  });

  it("status stays disconnected when SIWx is required and fails", async () => {
    mockClient.signMessage.mockRejectedValue(new Error("SIWx failed"));
    const { result } = renderWithProvider({ siwx: siwxConfig });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("disconnected");
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("status becomes connected normally when siwx is not configured", async () => {
    const { result } = renderWithProvider();

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("connected");
  });

  it("completePairing returns the session even when SIWx fails", async () => {
    mockClient.signMessage.mockRejectedValue(new Error("SIWx failed"));
    const { result } = renderWithProvider({ siwx: siwxConfig });

    let session: unknown;
    await act(async () => {
      session = await result.current.completePairing();
    });

    expect(session).toBe(mockSession);
    expect(result.current.status).toBe("disconnected");
  });
});

describe("Web3ConnectProvider — connector routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockStorage.saved = null;
    mockSessionManager.getActiveBundle.mockReturnValue(null);
    (mockClient as any).embeddedConnector = null;
    (mockClient as any).passkeysConnector = null;
  });

  it("routes an embedded fallback chain switch to the embedded connector", async () => {
    const embeddedSession = {
      ...mockSession,
      id: "pocket-session",
      walletType: "embedded",
      connectorId: "pocket",
    };
    const embeddedConnector = { switchChain: vi.fn().mockResolvedValue(undefined) };
    (mockClient as any).embeddedConnector = embeddedConnector;
    mockClient.connectEmbedded.mockResolvedValue(embeddedSession);
    const { result } = renderWithProvider({ enableEmbedded: true });

    await act(async () => {
      await result.current.connectEmbedded();
    });
    await act(async () => {
      await result.current.switchChain("eip155:11155111");
    });

    expect(embeddedConnector.switchChain).toHaveBeenCalledWith(
      embeddedSession,
      "eip155:11155111",
    );
    expect(
      (mockClient.connector as { switchChain?: unknown }).switchChain,
    ).toBeUndefined();
  });
});

describe("Web3ConnectProvider — session manager options", () => {
  beforeEach(() => {
    mockCreateSessionManager.mockClear();
  });

  it("forwards autoRefreshFeeOnSwitch and defaults it on", () => {
    renderWithProvider({ autoRefreshFeeOnSwitch: false });
    expect(mockCreateSessionManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoRefreshFeeOnSwitch: false }),
    );

    mockCreateSessionManager.mockClear();
    renderWithProvider();
    expect(mockCreateSessionManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoRefreshFeeOnSwitch: true }),
    );
  });
});

/**
 * SIWx on reconnect.
 *
 * `autoConnect` defaults to true, so reconnect is the path taken on every page
 * load. It used to report `connected` without SIWx ever running, which meant
 * `required: true` was enforced once at first connect and skipped on every
 * refresh afterwards.
 */
describe("Web3ConnectProvider — SIWx on reconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connect.mockReset().mockResolvedValue(mockSession);
    mockClient.reconnect.mockReset().mockResolvedValue(mockSession);
    mockClient.signMessage.mockReset().mockResolvedValue("0xsignature");
  });

  async function connectThenReconnect(config: Record<string, unknown>) {
    const { result } = renderWithProvider(config);
    await act(async () => {
      await result.current.connect();
    });
    siwxConfig.createMessage.mockClear();
    await act(async () => {
      await result.current.reconnect();
    });
    return result;
  }

  it("re-authenticates on reconnect when SIWx is required", async () => {
    const result = await connectThenReconnect({ siwx: siwxConfig });
    expect(siwxConfig.createMessage).toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });

  it("does not reach connected when the required signature fails", async () => {
    mockClient.signMessage.mockReset();
    const { result } = renderWithProvider({ siwx: siwxConfig });
    await act(async () => {
      await result.current.connect();
    });
    mockClient.signMessage.mockRejectedValue(new Error("user rejected"));
    await act(async () => {
      await result.current.reconnect();
    });
    expect(result.current.status).not.toBe("connected");
  });

  it("skips the prompt when the app says a session already exists", async () => {
    const hasValidSession = vi.fn().mockResolvedValue(true);
    const result = await connectThenReconnect({
      siwx: { ...siwxConfig, hasValidSession },
    });
    expect(hasValidSession).toHaveBeenCalled();
    expect(siwxConfig.createMessage).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });

  // A check that throws has not established a session. Assuming one would be
  // the exact failure this change exists to remove.
  it("asks for a signature when the session check throws", async () => {
    const hasValidSession = vi.fn().mockRejectedValue(new Error("storage gone"));
    await connectThenReconnect({ siwx: { ...siwxConfig, hasValidSession } });
    expect(siwxConfig.createMessage).toHaveBeenCalled();
  });

  // Prompting on every reload for something the app said it can live without
  // is the wrong trade.
  it("leaves optional SIWx alone on reconnect", async () => {
    const result = await connectThenReconnect({
      siwx: { ...siwxConfig, required: false },
    });
    expect(siwxConfig.createMessage).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });

  it("does not prompt when SIWx is not configured at all", async () => {
    const result = await connectThenReconnect({});
    expect(siwxConfig.createMessage).not.toHaveBeenCalled();
    expect(result.current.status).toBe("connected");
  });
});
