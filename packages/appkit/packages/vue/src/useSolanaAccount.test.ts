import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useSolanaAccount } from "./useSolanaAccount";

describe("useSolanaAccount", () => {
  it("selects the Solana namespace and clears it on disconnect", () => {
    const solana =
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK";
    const accounts = ref([
      "eip155:1:0x742D35CC6634C0532925a3B844Bc9E7595F2bD18",
      solana,
    ]);
    const connected = ref(true);
    const result = useSolanaAccount(accounts, connected);
    expect(result.caip10.value).toBe(solana);
    expect(result.address.value).toBe(
      "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK",
    );
    expect(result.chainId.value).toBe(
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
    connected.value = false;
    expect(result.address.value).toBeNull();
    expect(result.caip10.value).toBeNull();
  });
});
