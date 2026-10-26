/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseViemClient = vi.fn();
vi.mock("./useViemClient", () => ({
  useViemClient: () => mockUseViemClient(),
}));
const mockUseAccount = vi.fn();
vi.mock("./useAccount", () => ({
  useAccount: () => mockUseAccount(),
}));
const mockUseWeb3 = vi.fn();
vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mockUseWeb3(),
}));

import { REVOKE_DELEGATE } from "@naculus/connect-core";
import { useDelegate } from "./useDelegate";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
const IMPL = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B";
const HASH = `0x${"ab".repeat(32)}`;

let sendDelegation: ReturnType<typeof vi.fn>;
let getTransactionCount: ReturnType<typeof vi.fn>;

function connect(walletType: string, chainId = 1) {
  const session = { id: `${walletType}-1`, walletType };
  mockUseWeb3.mockReturnValue({
    session,
    chainId: "eip155:1",
    client: { embeddedConnector: { sendDelegation } },
  });
  mockUseViemClient.mockReturnValue({
    publicClient: { chain: { id: chainId }, getTransactionCount },
  });
  return session;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAccount.mockReturnValue({ evmAccount: `eip155:1:${ACCOUNT}` });
  getTransactionCount = vi.fn(async () => 6);
  sendDelegation = vi.fn(async (_session, request) => ({
    hash: HASH,
    authorization: { ...request, yParity: 0, r: "0x1", s: "0x2" },
  }));
});

describe("useDelegate", () => {
  it("sends an allowlisted delegation through the embedded connector", async () => {
    const session = connect("embedded");
    const { result } = renderHook(() => useDelegate({ allowlist: [IMPL] }));
    await act(async () => {
      await result.current.delegate(IMPL);
    });
    expect(getTransactionCount).toHaveBeenCalledWith({
      address: ACCOUNT,
      blockTag: "pending",
    });
    expect(sendDelegation).toHaveBeenCalledWith(session, {
      account: ACCOUNT,
      chainId: "eip155:1",
      address: IMPL,
      nonce: "0x7",
      transactionNonce: "0x6",
    });
    expect(result.current.result?.hash).toBe(HASH);
    expect(result.current.error).toBeNull();
  });

  it("refuses a non-embedded wallet before reading the nonce", async () => {
    connect("walletconnect");
    const { result } = renderHook(() => useDelegate({ allowlist: [IMPL] }));
    await act(async () => {
      await result.current.delegate(IMPL);
    });
    expect(result.current.error).toMatchObject({ code: "method_unsupported" });
    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendDelegation).not.toHaveBeenCalled();
  });

  it("refuses a delegate outside the allowlist, but always allows revoke", async () => {
    connect("embedded");
    const { result } = renderHook(() => useDelegate({ allowlist: [] }));
    await act(async () => {
      await result.current.delegate(IMPL);
    });
    expect(result.current.error).toMatchObject({ code: "method_not_allowed" });
    expect(sendDelegation).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.revoke();
    });
    expect(sendDelegation.mock.calls[0]?.[1].address).toBe(REVOKE_DELEGATE);
    expect(result.current.error).toBeNull();
  });

  it("refuses to read the nonce from an RPC on another chain", async () => {
    connect("embedded", 10);
    const { result } = renderHook(() => useDelegate({ allowlist: [IMPL] }));
    await act(async () => {
      await result.current.delegate(IMPL);
    });
    expect(result.current.error).toMatchObject({ code: "chain_mismatch" });
    expect(getTransactionCount).not.toHaveBeenCalled();
  });

  it("allows one delegation in flight, even across reset()", async () => {
    connect("embedded");
    let release!: () => void;
    sendDelegation.mockImplementationOnce(
      (_s, request) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              hash: HASH,
              authorization: { ...request, yParity: 0, r: "0x1", s: "0x2" },
            });
        }),
    );
    const { result } = renderHook(() => useDelegate({ allowlist: [IMPL] }));
    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.delegate(IMPL);
      await vi.waitFor(() => expect(sendDelegation).toHaveBeenCalled());
    });
    act(() => result.current.reset());
    await act(async () => {
      await result.current.revoke();
    });
    expect(result.current.error?.message).toMatch(/already in progress/);
    expect(sendDelegation).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
  });
});
