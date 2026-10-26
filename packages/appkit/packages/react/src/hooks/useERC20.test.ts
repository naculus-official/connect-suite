// @vitest-environment jsdom

import type { TokenConfig } from "@naculus/connect-core";
import { ERC20_MIN_ABI, parseUnits } from "@naculus/connect-core";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { encodeFunctionData } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(),
  simulateContract: vi.fn(),
  writeContract: vi.fn(),
  sendTransaction: vi.fn(),
  reset: vi.fn(),
  state: {} as Record<string, any>,
}));
vi.mock("./useViemClient", () => ({ useViemClient: () => mocks.state.viem }));
vi.mock("./useAccount", () => ({ useAccount: () => mocks.state.account }));
vi.mock("./useChain", () => ({
  useChain: () => ({ currentChain: mocks.state.chain }),
}));
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mocks.state.web3,
}));
vi.mock("./client-resolver", () => ({
  resolveClient: (client: unknown) => client,
}));
vi.mock("./useSendTransaction", () => ({
  useSendTransaction: () => ({
    sendTransaction: mocks.sendTransaction,
    reset: mocks.reset,
    isSending: false,
    error: null,
  }),
}));

import { useERC20Allowance } from "./useERC20Allowance";
import { useERC20Approve } from "./useERC20Approve";
import { useERC20Transfer } from "./useERC20Transfer";

const owner = "0x1111111111111111111111111111111111111111" as const;
const otherOwner = "0x2222222222222222222222222222222222222222" as const;
const spender = "0x3333333333333333333333333333333333333333" as const;
const otherSpender = "0x4444444444444444444444444444444444444444" as const;
const token: TokenConfig = {
  address: "0x5555555555555555555555555555555555555555",
  chainId: 1,
  decimals: 6,
};
const hash = "0x1234";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.viem = {
    publicClient: {
      readContract: mocks.readContract,
      simulateContract: mocks.simulateContract,
    },
    walletClient: null,
  };
  mocks.state.chain = { caip2: "eip155:1" };
  mocks.state.account = { evmAccount: "eip155:1:" + owner, isConnected: true };
  mocks.state.web3 = { session: {}, client: {} };
  mocks.readContract.mockResolvedValue(2_000_000n);
  mocks.sendTransaction.mockResolvedValue(hash);
  mocks.writeContract.mockResolvedValue(hash);
});

describe("ERC-20 send destinations", () => {
  it("rejects malformed transfer and approval recipients before submission", async () => {
    const invalid = "0x123" as `0x${string}`;
    const { result: transfer } = renderHook(() => useERC20Transfer({ token }));
    await act(async () => {
      await expect(transfer.current.sendTransfer(invalid, "1")).rejects.toThrow(
        /address/i,
      );
    });
    const { result: approval } = renderHook(() =>
      useERC20Approve({ token, spender: invalid }),
    );
    await act(async () => {
      await expect(approval.current.approve("1")).rejects.toThrow(/address/i);
    });
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });
});
afterEach(cleanup);

describe("ERC-20 allowance reads", () => {
  it("reads a six-decimal allowance without guessing 18", async () => {
    const { result } = renderHook(() =>
      useERC20Allowance({ token, owner, spender }),
    );
    await waitFor(() => expect(result.current.allowance).toBe("2"));
    expect(result.current.allowanceRaw).toBe(2_000_000n);
  });

  it("does not invent display precision", async () => {
    const { result } = renderHook(() =>
      useERC20Allowance({
        token: { ...token, decimals: undefined },
        owner,
        spender,
      }),
    );
    await waitFor(() => expect(result.current.allowanceRaw).toBe(2_000_000n));
    expect(result.current.allowance).toBeNull();
  });

  it("refuses reads on the wrong chain", async () => {
    mocks.state.chain = { caip2: "eip155:137" };
    const { result } = renderHook(() =>
      useERC20Allowance({ token, owner, spender }),
    );
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "chain_mismatch" }),
    );
    expect(mocks.readContract).not.toHaveBeenCalled();
  });

  it.each(["chain", "disconnect"])(
    "discards a pending read after %s",
    async (change) => {
      const pending = deferred<bigint>();
      mocks.readContract.mockReturnValueOnce(pending.promise);
      const { result, rerender } = renderHook(() =>
        useERC20Allowance({ token, owner, spender }),
      );
      expect(result.current.isFetching).toBe(true);
      if (change === "chain") mocks.state.chain = { caip2: "eip155:137" };
      else mocks.state.viem = { publicClient: null, walletClient: null };
      rerender();
      await act(async () => pending.resolve(900_000_000n));
      expect(result.current.allowanceRaw).toBeNull();
      expect(result.current.isFetching).toBe(false);
    },
  );

  it("hides the previous spender's allowance while the next read is pending", async () => {
    const next = deferred<bigint>();
    const { result, rerender } = renderHook(
      ({ target }) => useERC20Allowance({ token, owner, spender: target }),
      {
        initialProps: { target: spender as string as typeof spender },
      },
    );
    await waitFor(() => expect(result.current.allowanceRaw).toBe(2_000_000n));
    mocks.readContract.mockReturnValueOnce(next.promise);
    rerender({ target: otherSpender as typeof spender });
    expect(result.current.allowanceRaw).toBeNull();
    await act(async () => next.resolve(0n));
    expect(result.current.allowanceRaw).toBe(0n);
  });

  it("only lets the newest refetch update state", async () => {
    const older = deferred<bigint>();
    mocks.readContract
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(3n);
    const { result } = renderHook(() =>
      useERC20Allowance({ token, owner, spender }),
    );
    await act(async () => {
      await result.current.refetch();
    });
    await act(async () => older.resolve(8n));
    expect(result.current.allowanceRaw).toBe(3n);
  });

  it("does not refetch for an equivalent inline token object", async () => {
    const { result, rerender } = renderHook(() =>
      useERC20Allowance({ token: { ...token }, owner, spender }),
    );
    await waitFor(() => expect(result.current.allowanceRaw).toBe(2_000_000n));
    rerender();
    expect(mocks.readContract).toHaveBeenCalledTimes(1);
  });
});

describe("ERC-20 approval checks", () => {
  it("uses the first awaited allowance result", async () => {
    const { result } = renderHook(() => useERC20Approve({ token, spender }));
    await act(async () => {
      expect(await result.current.hasAllowance("1")).toBe(true);
    });
    expect(result.current.allowance).toBe("2");
  });

  it("reads unknown decimals before deciding whether approval is sufficient", async () => {
    mocks.readContract.mockImplementation(async ({ functionName }) =>
      functionName === "decimals" ? 6 : 2_000_000n,
    );
    const { result } = renderHook(() =>
      useERC20Approve({ token: { ...token, decimals: undefined }, spender }),
    );
    await act(async () => {
      expect(await result.current.hasAllowance("1")).toBe(true);
    });
    expect(mocks.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "decimals" }),
    );
  });

  it.each(["owner", "spender", "token", "chain", "disconnect"])(
    "does not reuse allowance after changing %s",
    async (change) => {
      const { result, rerender } = renderHook(
        (options) => useERC20Approve(options),
        {
          initialProps: { token, spender: spender as string as typeof spender },
        },
      );
      await act(async () => {
        await result.current.refetchAllowance();
      });
      expect(result.current.allowanceRaw).toBe(2_000_000n);
      mocks.readContract.mockResolvedValue(0n);
      const next = { token, spender: spender as typeof spender };
      if (change === "owner")
        mocks.state.account = {
          evmAccount: "eip155:1:" + otherOwner,
          isConnected: true,
        };
      if (change === "spender") next.spender = otherSpender as typeof spender;
      if (change === "token") next.token = { ...token, address: otherSpender };
      if (change === "chain") mocks.state.chain = { caip2: "eip155:137" };
      if (change === "disconnect")
        mocks.state.account = { evmAccount: null, isConnected: false };
      rerender(next);
      expect(result.current.allowanceRaw).toBeNull();
      await act(async () => {
        expect(await result.current.hasAllowance("1")).toBe(false);
      });
    },
  );

  it("does not return a stale refetch result to an awaiting caller", async () => {
    const pending = deferred<bigint>();
    mocks.readContract.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() =>
      useERC20Approve({ token, spender }),
    );
    let request!: Promise<bigint | null>;
    act(() => {
      request = result.current.refetchAllowance();
    });
    mocks.state.chain = { caip2: "eip155:137" };
    rerender();
    await act(async () => {
      pending.resolve(5_000_000n);
      expect(await request).toBeNull();
    });
    expect(result.current.allowanceRaw).toBeNull();
    expect(result.current.isFetchingAllowance).toBe(false);
  });

  it("clears old allowance on an RPC failure", async () => {
    const { result } = renderHook(() => useERC20Approve({ token, spender }));
    await act(async () => {
      await result.current.refetchAllowance();
    });
    mocks.readContract.mockRejectedValueOnce(new Error("RPC unavailable"));
    await act(async () => {
      expect(await result.current.refetchAllowance()).toBeNull();
    });
    expect(result.current.allowanceRaw).toBeNull();
    expect(result.current.error?.message).toBe("RPC unavailable");
  });
});

function useOperation(
  operation: "approve" | "transfer",
  config: TokenConfig,
) {
  const approval = useERC20Approve({ token: config, spender });
  const transfer = useERC20Transfer({ token: config });
  return operation === "approve"
    ? { send: approval.approve, error: approval.error }
    : {
        send: (amount: string) => transfer.sendTransfer(spender, amount),
        error: transfer.error,
      };
}

describe.each(["approve", "transfer"] as const)("ERC-20 %s", (operation) => {
  it("allows a simulated write when the context stays current", async () => {
    mocks.state.web3 = { session: null, client: null };
    mocks.state.viem.walletClient = { writeContract: mocks.writeContract };
    const simulatedRequest = {
      address: token.address,
      functionName: operation,
    };
    mocks.simulateContract.mockResolvedValueOnce({ request: simulatedRequest });
    const { result } = renderHook(() => useOperation(operation, token));
    await act(async () => {
      expect(await result.current.send("1")).toBe(hash);
    });
    expect(mocks.writeContract).toHaveBeenCalledWith(simulatedRequest);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("sends the exact ABI calldata for a six-decimal amount", async () => {
    const { result } = renderHook(() => useOperation(operation, token));
    await act(async () => {
      expect(await result.current.send("1.000001")).toBe(hash);
    });
    expect(mocks.sendTransaction).toHaveBeenCalledWith({
      to: token.address,
      value: "0",
      data: encodeFunctionData({
        abi: ERC20_MIN_ABI,
        functionName: operation,
        args: [spender, parseUnits("1.000001", 6)],
      }),
    });
  });

  it("does not request a signature after unmount", async () => {
    const pending = deferred<number>();
    mocks.readContract.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() =>
      useOperation(operation, { ...token, decimals: undefined }),
    );
    let request!: Promise<string>;
    act(() => {
      request = result.current.send("1");
    });
    const rejected = expect(request).rejects.toThrow(/changed/i);
    unmount();
    await act(async () => {
      pending.resolve(6);
      await rejected;
    });
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });

  it("blocks wrong-chain calls before reading decimals or requesting a signature", async () => {
    mocks.state.chain = { caip2: "eip155:137" };
    const { result } = renderHook(() =>
      useOperation(operation, { ...token, decimals: undefined }),
    );
    await act(async () => {
      await expect(result.current.send("1")).rejects.toMatchObject({
        code: "chain_mismatch",
      });
    });
    expect(mocks.readContract).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ code: "chain_mismatch" });
  });

  it.each(["chain", "owner"])(
    "cancels before signing when %s changes during decimals lookup",
    async (change) => {
      const pending = deferred<number>();
      mocks.readContract.mockReturnValueOnce(pending.promise);
      const { result, rerender } = renderHook(() =>
        useOperation(operation, { ...token, decimals: undefined }),
      );
      let request!: Promise<string>;
      act(() => {
        request = result.current.send("1");
      });
      const rejected = expect(request).rejects.toThrow(/changed/i);
      if (change === "chain") mocks.state.chain = { caip2: "eip155:137" };
      else
        mocks.state.account = {
          evmAccount: "eip155:1:" + otherOwner,
          isConnected: true,
        };
      rerender();
      await act(async () => {
        pending.resolve(6);
        await rejected;
      });
      expect(mocks.sendTransaction).not.toHaveBeenCalled();
      expect(mocks.writeContract).not.toHaveBeenCalled();
    },
  );

  it("cancels after simulation if the wallet context changed", async () => {
    const pending = deferred<{ request: object }>();
    mocks.state.web3 = { session: null, client: null };
    mocks.state.viem.walletClient = { writeContract: mocks.writeContract };
    mocks.simulateContract.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(() => useOperation(operation, token));
    let request!: Promise<string>;
    act(() => {
      request = result.current.send("1");
    });
    const rejected = expect(request).rejects.toThrow(/changed/i);
    mocks.state.chain = { caip2: "eip155:137" };
    rerender();
    await act(async () => {
      pending.resolve({ request: {} });
      await rejected;
    });
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });

  it("encodes the amount using the newly selected token's decimals", async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useOperation(operation, config),
      { initialProps: { config: token } },
    );
    await act(async () => {
      await result.current.send("1");
    });
    expect(mocks.sendTransaction.mock.calls[0][0].data.slice(-64)).toBe(
      (10n ** 6n).toString(16).padStart(64, "0"),
    );
    rerender({ config: { ...token, address: otherSpender, decimals: 18 } });
    await act(async () => {
      await result.current.send("1");
    });
    expect(mocks.sendTransaction.mock.calls[1][0].data.slice(-64)).toBe(
      (10n ** 18n).toString(16).padStart(64, "0"),
    );
  });
});
