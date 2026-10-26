import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useChain } from "./useChain";

const SOLANA_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const CHAINS = [
  { caip2: "eip155:1", name: "Ethereum" },
  { caip2: "eip155:137", name: "Polygon" },
  { caip2: SOLANA_CHAIN, name: "Solana" },
];

describe("useChain (Vue)", () => {
  it("resolves the connected chain", () => {
    const { currentChain } = useChain(CHAINS, "eip155:137");
    expect(currentChain.value?.name).toBe("Polygon");
  });

  // The same rule the React binding gets, from the same core function: a
  // wallet is only offered chains it could actually switch to.
  it("offers only the connected namespace", () => {
    expect(
      useChain(CHAINS, SOLANA_CHAIN).availableChains.value.map((c) => c.name),
    ).toEqual(["Solana"]);
    expect(
      useChain(CHAINS, "eip155:1").availableChains.value.map((c) => c.name),
    ).toEqual(["Ethereum", "Polygon"]);
  });

  it("describes a non-EVM chain instead of answering null", () => {
    const { chainInfo } = useChain(CHAINS, SOLANA_CHAIN);
    expect(chainInfo.value?.namespace).toBe("solana");
    expect(chainInfo.value?.name).toBe("Solana");
  });

  // There is no number that means "Solana", and any stand-in would address a
  // real EVM chain.
  it("has no chain number for a non-EVM chain", () => {
    expect(useChain(CHAINS, SOLANA_CHAIN).currentChainNumber.value).toBeNull();
    expect(useChain(CHAINS, "eip155:137").currentChainNumber.value).toBe(137);
  });

  it("tracks refs", () => {
    const id = ref<string | null>("eip155:1");
    const { currentChain, namespace } = useChain(CHAINS, id);
    expect(currentChain.value?.name).toBe("Ethereum");
    id.value = SOLANA_CHAIN;
    expect(currentChain.value?.name).toBe("Solana");
    expect(namespace.value).toBe("solana");
  });

  it("handles an empty or absent chain list", () => {
    expect(useChain(null, "eip155:1").currentChain.value).toBeNull();
    expect(useChain([], null).availableChains.value).toEqual([]);
  });
});
