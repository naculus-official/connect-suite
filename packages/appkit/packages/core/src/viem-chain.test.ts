import { describe, expect, it } from "vitest";
import { toViemChain } from "./viem-chain";

describe("toViemChain", () => {
  it("does not label an unlisted EVM chain as ETH", () => {
    const chain = toViemChain(
      {
        caip2: "eip155:7777777",
        name: "Private EVM",
        rpcUrl: "https://rpc.example",
      },
      7_777_777,
    );

    expect(chain?.nativeCurrency).toEqual({
      name: "",
      symbol: "",
      decimals: 18,
    });
  });
});
