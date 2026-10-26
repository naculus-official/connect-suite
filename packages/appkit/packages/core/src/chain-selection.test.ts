/// <reference types="vitest" />
import { describe, expect, it } from "vitest";
import {
  chainNamespace,
  chainNumber,
  chainsForNamespace,
  describeChain,
  resolveChain,
} from "./chain-selection";
import type { WalletChain } from "./types";

const SOLANA_CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

const CHAINS: WalletChain[] = [
  { caip2: "eip155:1", name: "Ethereum" },
  { caip2: "eip155:137", name: "Polygon" },
  { caip2: SOLANA_CHAIN, name: "Solana" },
];

describe("resolveChain", () => {
  it("finds a configured EVM chain", () => {
    expect(resolveChain(CHAINS, "eip155:137")?.name).toBe("Polygon");
  });

  // Now a string comparison. The registry used to be keyed by an integer, so
  // a Solana cluster could not be represented at all and an entry with id 5
  // was what `parseInt` on its base58 reference would have matched.
  it("finds a Solana chain, and does not confuse it with chain 5", () => {
    expect(resolveChain(CHAINS, SOLANA_CHAIN)?.name).toBe("Solana");
    const withFive: WalletChain[] = [
      ...CHAINS,
      { caip2: "eip155:5", name: "Goerli" },
    ];
    expect(resolveChain(withFive, SOLANA_CHAIN)?.name).toBe("Solana");
  });

  it("is null for an unconfigured or absent chain", () => {
    expect(resolveChain(CHAINS, "eip155:8453")).toBeNull();
    expect(resolveChain(CHAINS, null)).toBeNull();
    expect(resolveChain(CHAINS, "nonsense")).toBeNull();
  });
});

describe("chainsForNamespace", () => {
  // The live defect: a Solana wallet was offered Ethereum and Polygon, and
  // clicking one asked it to switch to a chain it has no concept of.
  it("offers only chains the connected wallet could switch to", () => {
    expect(chainsForNamespace(CHAINS, SOLANA_CHAIN).map((c) => c.name)).toEqual(
      ["Solana"],
    );
    expect(chainsForNamespace(CHAINS, "eip155:1").map((c) => c.name)).toEqual([
      "Ethereum",
      "Polygon",
    ]);
  });

  // Nothing has been ruled out yet, and hiding the list would leave a user
  // unable to pick at all.
  it("offers everything when no chain is connected", () => {
    expect(chainsForNamespace(CHAINS, null)).toHaveLength(3);
    expect(chainsForNamespace(CHAINS, undefined)).toHaveLength(3);
  });

  it("offers everything rather than nothing for an unreadable chain id", () => {
    expect(chainsForNamespace(CHAINS, "garbage")).toHaveLength(3);
  });
});

describe("describeChain", () => {
  it("names a configured chain", () => {
    expect(describeChain(CHAINS, "eip155:1")).toEqual({
      namespace: "eip155",
      chainId: "eip155:1",
      name: "Ethereum",
      selected: true,
    });
  });

  // It used to return null for anything not EIP-155, so a connected Solana
  // wallet had no chain to display and the UI showed "Unknown Chain".
  it("describes a non-EVM chain instead of answering null", () => {
    const info = describeChain(CHAINS, SOLANA_CHAIN);
    expect(info?.namespace).toBe("solana");
    expect(info?.chainId).toBe(SOLANA_CHAIN);
    expect(info?.name).toBe("Solana");
  });

  it("names an unconfigured EVM chain by its reference", () => {
    expect(describeChain(CHAINS, "eip155:8453")?.name).toBe("Chain 8453");
  });

  // "Chain 5" for a Solana cluster would be a fabrication.
  it("does not invent a number for a non-EVM reference", () => {
    expect(describeChain([], SOLANA_CHAIN)?.name).toBe(
      "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    );
  });

  it("is null with no chain", () => {
    expect(describeChain(CHAINS, null)).toBeNull();
  });
});

describe("chainNumber", () => {
  it("reads the EIP-155 number for an EVM chain", () => {
    expect(chainNumber({ caip2: "eip155:137", name: "Polygon" })).toBe(137);
  });

  // There is no number that means "Solana". A caller needing one has to
  // handle the null, because any stand-in addresses a real EVM chain.
  it("is null for a chain that has no EIP-155 number", () => {
    expect(chainNumber({ caip2: SOLANA_CHAIN, name: "Solana" })).toBeNull();
    expect(chainNumber({ caip2: "xrpl:0", name: "XRPL" })).toBeNull();
  });
});

describe("chainNamespace", () => {
  it("reads the namespace from the chain's own id", () => {
    expect(chainNamespace({ caip2: "eip155:1", name: "Ethereum" })).toBe(
      "eip155",
    );
    expect(chainNamespace({ caip2: SOLANA_CHAIN, name: "Solana" })).toBe(
      "solana",
    );
  });

  // A single field cannot disagree with itself. The type used to carry
  // `namespace` next to `id`, and two fields that must agree eventually do not.
  it("cannot drift from the chain id, because there is nothing to drift from", () => {
    expect(chainNamespace({ caip2: "nonsense", name: "?" })).toBeNull();
  });
});

describe("framework boundary", () => {
  it("imports nothing from a framework", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(
      new URL("./chain-selection.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from "react"/);
    expect(source).not.toMatch(/from "vue"/);
  });
});
