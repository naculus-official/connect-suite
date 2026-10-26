import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useAccounts } from "./useAccounts";

const SOL_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOL_ADDRESS = "HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW";
const EVM_ADDRESS = `0x${"11".repeat(20)}`;

describe("useAccounts (Vue)", () => {
  it("splits a mixed account list by namespace", () => {
    const { accounts, evmAccount, solanaAccount } = useAccounts([
      `eip155:1:${EVM_ADDRESS}`,
      `${SOL_CHAIN}:${SOL_ADDRESS}`,
    ]);
    expect(accounts.value.map((a) => a.namespace)).toEqual([
      "eip155",
      "solana",
    ]);
    expect(evmAccount.value).toBe(`eip155:1:${EVM_ADDRESS}`);
    expect(solanaAccount.value).toBe(`${SOL_CHAIN}:${SOL_ADDRESS}`);
  });

  // The namespace decides, not the characters. This is the same rule the
  // React hook applies, from the same core function.
  it("does not call a Solana account EVM", () => {
    const { accounts, evmAccount } = useAccounts([
      `${SOL_CHAIN}:${SOL_ADDRESS}`,
    ]);
    expect(accounts.value[0].isEVM).toBe(false);
    expect(evmAccount.value).toBeNull();
  });

  it("reads a bare hex address by shape", () => {
    const { accounts, evmAccount } = useAccounts([EVM_ADDRESS]);
    expect(accounts.value[0]).toEqual({
      address: EVM_ADDRESS,
      namespace: null,
      isEVM: true,
    });
    expect(evmAccount.value).toBe(EVM_ADDRESS);
  });

  // A bare base58 string is not unambiguously anything.
  it("claims nothing about a bare non-hex address", () => {
    const { accounts, evmAccount } = useAccounts([SOL_ADDRESS]);
    expect(accounts.value[0]).toEqual({
      address: SOL_ADDRESS,
      namespace: null,
      isEVM: false,
    });
    expect(evmAccount.value).toBeNull();
  });

  it("tracks a ref", () => {
    const list = ref<string[]>([]);
    const { evmAccount } = useAccounts(list);
    expect(evmAccount.value).toBeNull();
    list.value = [`eip155:1:${EVM_ADDRESS}`];
    expect(evmAccount.value).toBe(`eip155:1:${EVM_ADDRESS}`);
  });

  it("handles null and empty without throwing", () => {
    expect(useAccounts(null).accounts.value).toEqual([]);
    expect(useAccounts([]).evmAccount.value).toBeNull();
  });
});
