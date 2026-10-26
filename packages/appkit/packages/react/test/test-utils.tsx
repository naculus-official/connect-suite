
import { renderHook } from "@testing-library/react";
import type { UniversalWalletSession } from "@naculus/connect-core";
import type { Web3ContextValue } from "../src/provider/Web3ConnectProvider";

// Default mock session
export const defaultSession: UniversalWalletSession = {
  topic: "test-topic",
  relay: { protocol: "irn" },
  namespaces: {
    eip155: {
      accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
      chains: ["eip155:1"],
      methods: ["eth_sendTransaction", "personal_sign"],
      events: ["chainChanged", "accountsChanged"],
    },
  },
  expiry: Date.now() + 86400000,
  acknowledged: true,
  pairingTopic: "test-pairing",
};

// Create a default mock context value
export function createMockContextValue(
  overrides: Partial<Web3ContextValue> = {}
): Web3ContextValue {
  return {
    status: "disconnected" as const,
    session: null,
    accounts: [],
    chainId: null,
    error: null,
    isConnected: false,
    chains: [
      {
        id: 1,
        namespace: "eip155",
        name: "Ethereum Mainnet",
        rpcUrl: "https://rpc.ankr.com/eth",
        token: "ETH",
      },
      {
        id: 137,
        namespace: "eip155",
        name: "Polygon",
        rpcUrl: "https://rpc.ankr.com/polygon",
        token: "MATIC",
      },
    ],
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    reconnect: vi.fn().mockResolvedValue(undefined),
    switchChain: vi.fn().mockResolvedValue(undefined),
    startPairing: vi.fn().mockResolvedValue("pairing-uri"),
    completePairing: vi.fn().mockResolvedValue(defaultSession),
    connectInjected: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Render hook with mocked useWeb3
export function renderHookWithMockWeb3<Result, Props>(
  hook: (props: Props) => Result,
  options?: {
    initialProps?: Props;
    contextValue?: Partial<Web3ContextValue>;
  }
) {
  const _mockValue = createMockContextValue(options?.contextValue);

  // We mock at import time — caller must vi.mock("../src/provider/Web3ConnectProvider")
  // This utility just provides the mock values

  return renderHook(hook, {
    initialProps: options?.initialProps,
  });
}
