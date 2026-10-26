import { describe, expect, it } from "vitest";
import {
  resolveContextSimulationEndpoint,
  resolveSimulationEndpoint,
} from "./simulation-endpoint";

describe("simulation endpoint selection", () => {
  it("rejects absent chain instead of silently selecting mainnet", () => {
    expect(() => resolveSimulationEndpoint(undefined, undefined)).toThrow(
      /No chain to simulate on/,
    );
  });

  it("honors per-call chain and RPC over hook defaults", () => {
    expect(resolveSimulationEndpoint(8453, 1, "per-call", "hook")).toEqual({
      chainId: 8453,
      rpcUrl: "per-call",
    });
    expect(
      resolveSimulationEndpoint(undefined, 137, undefined, "hook"),
    ).toEqual({
      chainId: 137,
      rpcUrl: "hook",
    });
  });

  it("does not reuse a different chain's fallback RPC", () => {
    expect(() =>
      resolveSimulationEndpoint(8453, 1, undefined, "mainnet-rpc"),
    ).toThrow(/requires an RPC URL/);
  });

  it("uses only EVM CAIP-2 chain context and preserves its RPC", () => {
    expect(
      resolveContextSimulationEndpoint(undefined, {
        caip2: "eip155:137",
        name: "Polygon",
        rpcUrl: "polygon-rpc",
      }),
    ).toEqual({ chainId: 137, rpcUrl: "polygon-rpc" });
    expect(() =>
      resolveContextSimulationEndpoint(undefined, {
        caip2: "solana:mainnet",
        name: "Solana",
        rpcUrl: "solana-rpc",
      }),
    ).toThrow(/No chain to simulate on/);
  });
});
