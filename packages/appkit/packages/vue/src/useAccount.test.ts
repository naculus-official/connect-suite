import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useAccount } from "./useAccount";

describe("useAccount", () => {
  it("tracks connection and preserves the React null-versus-empty semantics", () => {
    const accounts = ref([
      "eip155:1:0x742D35CC6634C0532925a3B844Bc9E7595F2bD18",
    ]);
    const connected = ref(false);
    const result = useAccount(accounts, connected);
    expect(result.accounts.value).toBeNull();
    expect(result.evmAccount.value).toBeNull();
    expect(result.primaryAccount.value).toBe(accounts.value[0]);
    expect(result.count.value).toBe(1);

    connected.value = true;
    expect(result.accounts.value?.[0]?.namespace).toBe("eip155");
    expect(result.evmAccount.value).toBe(accounts.value[0]);
    accounts.value = [];
    expect(result.accounts.value).toBeNull();
    expect(result.count.value).toBe(0);
  });
});
