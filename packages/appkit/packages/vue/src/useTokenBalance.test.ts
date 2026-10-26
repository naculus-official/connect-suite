import { ERC20_MIN_ABI } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { type TokenInfo, useTokenBalance } from "./useTokenBalance";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const USDC: TokenInfo = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  symbol: "USDC",
  decimals: 6,
};
const DAI: TokenInfo = {
  address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  symbol: "DAI",
  decimals: 18,
};

describe("useTokenBalance (Vue)", () => {
  it("reads each token through balanceOf and formats by its decimals", async () => {
    const readContract = vi.fn(async ({ address }: { address: string }) =>
      address === USDC.address ? 2_500_000n : 3_000_000_000_000_000_000n,
    );
    const { api } = inScope(() =>
      useTokenBalance(`eip155:1:${OWNER}`, { readContract }, [USDC, DAI]),
    );
    await vi.waitFor(() => expect(api.tokenBalances.value).toHaveLength(2));
    expect(api.getTokenBalance(USDC.address)?.formatted).toBe("2.5");
    expect(api.getTokenBalance(DAI.address)?.formatted).toBe("3");
    expect(readContract).toHaveBeenCalledWith({
      address: USDC.address,
      abi: ERC20_MIN_ABI,
      functionName: "balanceOf",
      args: [OWNER],
    });
  });

  it("keeps the other tokens when one read fails", async () => {
    const readContract = vi.fn(async ({ address }: { address: string }) => {
      if (address === DAI.address) throw new Error("revert");
      return 1_000_000n;
    });
    const { api } = inScope(() =>
      useTokenBalance(OWNER, { readContract }, [USDC, DAI]),
    );
    await vi.waitFor(() => expect(api.tokenBalances.value).toHaveLength(2));
    expect(api.getTokenBalance(USDC.address)?.balance).toBe("1000000");
    expect(api.getTokenBalance(DAI.address)?.balance).toBeNull();
    expect(api.error.value).toBeNull();
  });

  it("reads nothing without tokens and re-reads when the token list changes", async () => {
    const readContract = vi.fn(async () => 5n);
    const tokens = ref<TokenInfo[]>([]);
    const { api } = inScope(() =>
      useTokenBalance(OWNER, { readContract }, tokens),
    );
    await nextTick();
    expect(readContract).not.toHaveBeenCalled();
    expect(api.tokenBalances.value).toEqual([]);

    tokens.value = [USDC];
    await vi.waitFor(() => expect(api.tokenBalances.value).toHaveLength(1));
    expect(readContract).toHaveBeenCalledTimes(1);

    // Same content, new array identity: no re-read.
    tokens.value = [{ ...USDC }];
    await nextTick();
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("drops a late result after the account changes", async () => {
    let releaseFirst!: (value: bigint) => void;
    const readContract = vi
      .fn<(args: { address: string }) => Promise<bigint>>()
      .mockImplementationOnce(
        () =>
          new Promise<bigint>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(9n);
    const account = ref<string>(OWNER);
    const { api } = inScope(() =>
      useTokenBalance(account, { readContract }, [USDC]),
    );
    account.value = "0x2222222222222222222222222222222222222222";
    await vi.waitFor(() =>
      expect(api.getTokenBalance(USDC.address)?.balance).toBe("9"),
    );
    releaseFirst(1n);
    await nextTick();
    expect(api.getTokenBalance(USDC.address)?.balance).toBe("9");
  });

  it("keeps the newest refetch when an older one resolves last", async () => {
    const releases: Array<(value: bigint) => void> = [];
    const readContract = vi.fn(
      () =>
        new Promise<bigint>((resolve) => {
          releases.push(resolve);
        }),
    );
    const { api, scope } = inScope(() =>
      useTokenBalance(OWNER, { readContract }, [USDC]),
    );

    const callA = api.refetch();
    const callB = api.refetch();
    releases[2]!(2_000_000n);
    await callB;
    releases[1]!(1_000_000n);
    releases[0]!(0n);
    await callA;
    expect(api.getTokenBalance(USDC.address)?.formatted).toBe("2");
    expect(api.isFetching.value).toBe(false);
    scope.stop();
  });

  it("publishes nothing after disposal", async () => {
    const releases: Array<(value: bigint) => void> = [];
    const readContract = vi.fn(
      () =>
        new Promise<bigint>((resolve) => {
          releases.push(resolve);
        }),
    );
    const { api, scope } = inScope(() =>
      useTokenBalance(OWNER, { readContract }, [USDC]),
    );
    scope.stop();
    releases[0]!(1_000_000n);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.tokenBalances.value).toEqual([]);
    expect(api.isFetching.value).toBe(true);
  });
});
