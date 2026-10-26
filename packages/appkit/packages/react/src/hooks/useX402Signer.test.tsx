/// <reference types="vitest" />
/// @vitest-environment jsdom

import { eip6963Connector } from "@naculus/connector-evm-injected";
import {
  createX402Fetch,
  encodeHeader,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type X402PaymentRequirements,
} from "@naculus/payments-x402";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Web3Context,
  type Web3ContextValue,
} from "../provider/Web3ConnectProvider";
import { useX402Signer } from "./useX402Signer";

const account = privateKeyToAccount(`0x${"04".repeat(32)}`);
const token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payee = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

describe("useX402Signer", () => {
  afterEach(() => eip6963Connector.clear());

  it("switches and signs an actual createX402Fetch payment", async () => {
    let chain = "0x1";
    const provider = {
      request: vi.fn(async ({ method, params }) => {
        if (method === "eth_chainId") return chain;
        if (method === "eth_signTypedData_v4") {
          return account.signTypedData(JSON.parse(String(params?.[1])));
        }
        throw new Error(`Unexpected method ${method}`);
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const unregister = eip6963Connector.registerProvider(
      { uuid: "wallet-1", name: "Wallet", icon: "", rdns: "example.wallet" },
      provider,
    );
    const switchChain = vi.fn(async (target: string) => {
      expect(target).toBe("eip155:84532");
      chain = "0x14a34";
    });
    const session = {
      id: "eip6963-wallet-1",
      walletId: "wallet-1",
      walletType: "eip6963",
      namespaces: {
        eip155: {
          chains: ["eip155:1"],
          accounts: [`eip155:1:${account.address}`],
          methods: ["eth_signTypedData_v4"],
          events: [],
        },
      },
      platform: "desktop-web",
      createdAt: "2026-10-04T00:00:00.000Z",
      updatedAt: "2026-10-04T00:00:00.000Z",
    } as const;
    const value = {
      session,
      accounts: [account.address],
      chainId: "eip155:1",
      client: { connector: {} },
      switchChain,
    } as unknown as Web3ContextValue;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Web3Context.Provider value={value}>{children}</Web3Context.Provider>
    );
    const { result } = renderHook(() => useX402Signer(), { wrapper });

    expect(result.current.reason).toBeNull();
    const requirement: X402PaymentRequirements = {
      scheme: "exact",
      network: "eip155:84532",
      amount: "10000",
      asset: token,
      payTo: payee,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    };
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (!request.headers.has(PAYMENT_SIGNATURE_HEADER)) {
        return new Response(null, {
          status: 402,
          headers: {
            [PAYMENT_REQUIRED_HEADER]: encodeHeader({
              x402Version: 2,
              resource: { url: "https://api.example.com/data" },
              accepts: [requirement],
            }),
          },
        });
      }
      return new Response("paid");
    });

    const paid = await createX402Fetch({
      signer: result.current.signer!,
      fetch: fetch as typeof globalThis.fetch,
    })("https://api.example.com/data");
    expect(await paid.response.text()).toBe("paid");
    expect(switchChain).toHaveBeenCalledOnce();
    expect(
      provider.request.mock.calls.map(([request]) => request.method),
    ).toEqual(["eth_chainId", "eth_chainId", "eth_signTypedData_v4"]);
    unregister();
  });
});
