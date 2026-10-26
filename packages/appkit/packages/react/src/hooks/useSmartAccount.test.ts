/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useWeb3: vi.fn(),
  manager: {
    createAccount: vi.fn(),
    getAccountAddress: vi.fn(),
    getDeployCallData: vi.fn(),
  },
  SmartAccountManager: vi.fn(function smartAccountManager() {
    return mocks.manager;
  }),
}));

vi.mock("./useAccount", () => ({
  useAccount: () => mocks.useAccount(),
}));

vi.mock("../provider/Web3ConnectProvider", () => ({
  useWeb3: () => mocks.useWeb3(),
}));

vi.mock("@naculus/connect-core", async () => {
  const actual = await vi.importActual<typeof import("@naculus/connect-core")>(
    "@naculus/connect-core",
  );
  return {
    ...actual,
    SmartAccountManager: mocks.SmartAccountManager,
  };
});

import { useSmartAccount } from "./useSmartAccount";

const OWNER = "0x1234567890123456789012345678901234567890";
const SMART_ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FACTORY = "0x1111111111111111111111111111111111111111";
const session = { id: "wc-session", walletType: "walletconnect" } as any;

function setup() {
  const sendTransaction = vi.fn().mockResolvedValue("0x" + "ab".repeat(32));
  mocks.useAccount.mockReturnValue({ evmAccount: `eip155:1:${OWNER}` });
  mocks.useWeb3.mockReturnValue({
    session,
    chainId: "eip155:1",
    client: { sendTransaction },
  });
  return { sendTransaction };
}

describe("useSmartAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    mocks.manager.createAccount.mockResolvedValue({
      address: SMART_ACCOUNT,
      isDeployed: false,
      accountType: "simple",
      owner: OWNER,
    });
    mocks.manager.getDeployCallData.mockResolvedValue({
      to: FACTORY,
      data: "0xdeadbeef",
      value: 0n,
    });
  });

  it("derives the owner and selected chain when creating an account", async () => {
    const { result } = renderHook(() =>
      useSmartAccount({ rpcUrl: "https://rpc.example", chainId: "eip155:1" }),
    );

    await waitFor(() => expect(mocks.SmartAccountManager).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.createWallet()).resolves.toMatchObject({
        address: SMART_ACCOUNT,
      });
    });

    expect(mocks.manager.createAccount).toHaveBeenCalledWith({
      owner: OWNER,
      accountType: "simple",
      entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      chainId: "eip155:1",
      salt: undefined,
    });
    expect(result.current.address).toBe(SMART_ACCOUNT);
  });

  it("deploys an account that is not deployed through the active wallet", async () => {
    const { sendTransaction } = setup();
    mocks.manager.createAccount
      .mockResolvedValueOnce({
        address: SMART_ACCOUNT,
        isDeployed: false,
        accountType: "simple",
        owner: OWNER,
      })
      .mockResolvedValueOnce({
        address: SMART_ACCOUNT,
        isDeployed: true,
        accountType: "simple",
        owner: OWNER,
      });

    const { result } = renderHook(() =>
      useSmartAccount({ rpcUrl: "https://rpc.example", chainId: "eip155:1" }),
    );
    await waitFor(() => expect(mocks.SmartAccountManager).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.deployWallet()).resolves.toBe(
        "0x" + "ab".repeat(32),
      );
    });

    expect(mocks.manager.getDeployCallData).toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledWith(session, {
      transaction: {
        to: FACTORY,
        data: "0xdeadbeef",
        value: "0",
      },
      chainId: "eip155:1",
    });
    expect(result.current.isDeployed).toBe(true);
  });

  it("refuses deployment when the connected chain differs", async () => {
    const { sendTransaction } = setup();
    mocks.useWeb3.mockReturnValue({
      session,
      chainId: "eip155:137",
      client: { sendTransaction },
    });

    const { result } = renderHook(() =>
      useSmartAccount({ rpcUrl: "https://rpc.example", chainId: "eip155:1" }),
    );
    await waitFor(() => expect(mocks.SmartAccountManager).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.deployWallet()).resolves.toBeNull();
    });

    expect(result.current.error?.message).toContain("does not match");
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
