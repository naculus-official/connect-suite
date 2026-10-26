import { describe, expect, it } from "vitest";
import { selectSiwxAccount } from "./siwx-accounts";

describe("selectSiwxAccount", () => {
  it("does not select an account from another namespace", () => {
    const session = {
      namespaces: {
        solana: {
          chains: ["solana:4sGjMW1s"],
          accounts: ["solana:4sGjMW1s:SolanaAddress"],
        },
      },
    } as any;

    expect(selectSiwxAccount(session, "eip155:1")).toBeUndefined();
  });

  it("selects an account only when its CAIP namespace matches", () => {
    const session = {
      namespaces: {
        eip155: {
          chains: ["eip155:1"],
          accounts: ["eip155:1:0x1234567890123456789012345678901234567890"],
        },
      },
    } as any;

    expect(selectSiwxAccount(session, "eip155:1")).toMatchObject({
      namespace: "eip155",
      address: "0x1234567890123456789012345678901234567890",
    });
  });
});
