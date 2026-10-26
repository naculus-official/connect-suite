import type { UniversalWalletSession } from "@naculus/connect-core";
import {
  createX402Fetch,
  encodeHeader,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  type X402PaymentRequirements,
} from "@naculus/payments-x402";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useX402Signer } from "./useX402Signer";

const account = privateKeyToAccount(`0x${"04".repeat(32)}`);
const token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payee = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

describe("useX402Signer", () => {
  it("switches and signs an actual createX402Fetch payment", async () => {
    let providerChain = "0x1";
    const provider = {
      request: vi.fn(async ({ method, params }) => {
        if (method === "eth_chainId") return providerChain;
        if (method === "eth_signTypedData_v4") {
          return account.signTypedData(JSON.parse(String(params?.[1])));
        }
        throw new Error(`Unexpected method ${method}`);
      }),
    };
    const session = ref<UniversalWalletSession>({
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
    });
    const chainId = ref("eip155:1");
    const switchChain = vi.fn(async (target: string) => {
      expect(target).toBe("eip155:84532");
      providerChain = "0x14a34";
      chainId.value = target;
    });
    const hook = useX402Signer(session, provider, switchChain, chainId);
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

    expect(hook.reason.value).toBeNull();
    const paid = await createX402Fetch({
      signer: hook.signer.value!,
      fetch: fetch as typeof globalThis.fetch,
    })("https://api.example.com/data");
    expect(await paid.response.text()).toBe("paid");
    expect(switchChain).toHaveBeenCalledOnce();
    expect(
      provider.request.mock.calls.map(([request]) => request.method),
    ).toEqual(["eth_chainId", "eth_chainId", "eth_signTypedData_v4"]);
  });
});
