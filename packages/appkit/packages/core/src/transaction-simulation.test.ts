import { describe, expect, it, vi } from "vitest";
import { simulateTransactionPreview } from "./transaction-simulation";

const tx = { to: `0x${"1".repeat(40)}`, data: "0x1234", gas: "21000" };
const chain = { caip2: "eip155:137", name: "Polygon", rpcUrl: "https://rpc" };

describe("simulateTransactionPreview", () => {
  it("does not infer a chain from an absent context", async () => {
    await expect(simulateTransactionPreview(tx, {})).rejects.toThrow(
      /No chain to simulate on/,
    );
  });

  it("uses the client and reports revert-only coverage", async () => {
    const call = vi.fn().mockResolvedValue({});
    const result = await simulateTransactionPreview(tx, {
      currentChain: chain,
      publicClient: { chain: { id: 137 }, call },
      evmAccount: `eip155:137:0x${"2".repeat(40)}`,
    });
    expect(call).toHaveBeenCalledWith({
      to: tx.to,
      data: tx.data,
      value: 0n,
      from: `0x${"2".repeat(40)}`,
    });
    expect(result.status).toBe("success");
    expect(result.coverage).toEqual({
      balanceChanges: false,
      approvalChanges: false,
      risk: false,
    });
    expect(result.gasInfo?.gasLimit).toBe(21000n);
  });

  it("does not fall back to another RPC after a client revert", async () => {
    const fetcher = vi.fn();
    const result = await simulateTransactionPreview(tx, {
      currentChain: chain,
      publicClient: {
        chain: { id: 137 },
        call: vi.fn().mockRejectedValue(new Error("execution reverted")),
      },
      fetcher,
    });
    expect(result.status).toBe("reverted");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back only to the configured chain RPC", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ json: async () => ({ result: "0x" }) });
    const result = await simulateTransactionPreview(tx, {
      currentChain: chain,
      fetcher,
    });
    expect(result.status).toBe("success");
    expect(fetcher).toHaveBeenCalledWith(
      "https://rpc",
      expect.objectContaining({ method: "POST" }),
    );
    const noRpc = await simulateTransactionPreview(tx, {
      chainId: 137,
      fetcher,
    });
    expect(noRpc.status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not claim risk or balance coverage on RPC errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("down"));
    const result = await simulateTransactionPreview(tx, {
      currentChain: chain,
      fetcher,
    });
    expect(result.status).toBe("unavailable");
    expect(result.coverage?.risk).toBe(false);
    expect(result.riskAssessment.warnings[0]?.message).toContain("down");
  });

  it("rejects a chain or client that mismatches the endpoint", async () => {
    await expect(
      simulateTransactionPreview(tx, { chainId: 1, currentChain: chain }),
    ).rejects.toThrow(/does not match the connected chain/);
    const call = vi.fn();
    await expect(
      simulateTransactionPreview(tx, {
        currentChain: chain,
        publicClient: { chain: { id: 1 }, call },
      }),
    ).rejects.toThrow(/client chain does not match/);
    expect(call).not.toHaveBeenCalled();
  });
});
