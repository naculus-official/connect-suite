/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAccount: vi.fn(),
  useWeb3: vi.fn(),
  manager: {
    sendUserOperation: vi.fn(),
    getUserOperationReceipt: vi.fn(),
  },
  // Declares the config parameter so mock.calls is typed as a one-element
  // tuple; the signer handed to the constructor is what these tests inspect.
  SmartAccountManager: vi.fn(function smartAccountManager(_config: {
    signer: (hash: string) => Promise<string>;
  }) {
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

import { useSendUserOperation } from "./useSendUserOperation";

const OWNER = "0x1234567890123456789012345678901234567890";
const TARGET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const response = {
  userOpHash: `0x${"ab".repeat(32)}`,
  sender: TARGET,
  nonce: 4n,
};
const calls = [{ to: TARGET, value: 0n, data: "0x" }] as any;
const session = { id: "wc-session", walletType: "walletconnect" } as any;

function setup({ chainId = "eip155:1", activeSession = session } = {}) {
  const request = vi.fn().mockResolvedValue(`0x${"11".repeat(65)}`);
  mocks.useAccount.mockReturnValue({ evmAccount: `eip155:1:${OWNER}` });
  mocks.useWeb3.mockReturnValue({
    session: activeSession,
    chainId,
    client: { connector: { request } },
  });
  return { request };
}

describe("useSendUserOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    mocks.manager.sendUserOperation.mockResolvedValue(response);
    mocks.manager.getUserOperationReceipt.mockResolvedValue(null);
  });

  it("uses SmartAccountManager with the connected owner and real operation path", async () => {
    const { result } = renderHook(() =>
      useSendUserOperation({
        rpcUrl: "https://rpc.example",
        bundlerUrl: "https://bundler.example",
        chainId: "eip155:1",
      }),
    );

    await act(async () => {
      await expect(result.current.sendUserOp(calls)).resolves.toEqual(response);
    });

    const managerCalls = mocks.SmartAccountManager.mock
      .calls as unknown as Array<[Record<string, unknown>]>;
    const managerConfig = (managerCalls[0]?.[0] ?? {}) as Record<
      string,
      unknown
    >;
    expect(managerConfig).toMatchObject({
      rpcUrl: "https://rpc.example",
      bundlerClient: { url: "https://bundler.example" },
      chainId: "eip155:1",
      signerMode: "raw",
    });
    expect(mocks.manager.sendUserOperation).toHaveBeenCalledWith(
      {
        owner: OWNER,
        accountType: "simple",
        entryPoint: ENTRY_POINT,
        chainId: "eip155:1",
        salt: undefined,
      },
      calls,
      undefined,
    );
    expect(result.current.userOpHash).toBe(response.userOpHash);
    expect(mocks.manager.getUserOperationReceipt).toHaveBeenCalledWith(
      response.userOpHash,
    );
  });

  it("passes a custom raw signer through without ever using a zero sender", async () => {
    const signer = vi.fn().mockResolvedValue(`0x${"22".repeat(65)}`);
    const { result } = renderHook(() =>
      useSendUserOperation({
        rpcUrl: "https://rpc.example",
        bundlerUrl: "https://bundler.example",
        owner: OWNER,
        signer,
        signerMode: "raw",
      }),
    );

    await act(async () => {
      await expect(result.current.sendUserOp(calls)).resolves.toEqual(response);
    });

    const sendCalls = mocks.manager.sendUserOperation.mock
      .calls as unknown as Array<[{ owner?: string }]>;
    const accountConfig = (sendCalls[0]?.[0] ?? {}) as { owner?: string };
    expect(accountConfig.owner).toBe(OWNER);
    expect(accountConfig.owner).not.toBe(
      "0x0000000000000000000000000000000000000000",
    );
    const managerCalls = mocks.SmartAccountManager.mock
      .calls as unknown as Array<
      [
        {
          signer?: unknown;
          signerMode?: unknown;
        },
      ]
    >;
    expect(managerCalls[0]?.[0].signer).toBe(signer);
    expect(managerCalls[0]?.[0].signerMode).toBe("raw");
  });

  it("uses raw personal_sign bytes for a WalletConnect session", async () => {
    const { request } = setup();
    const hash = `0x${"33".repeat(32)}`;
    mocks.manager.sendUserOperation.mockImplementation(async () => {
      const managerCalls = mocks.SmartAccountManager.mock
        .calls as unknown as Array<
        [
          {
            signer: (hash: string) => Promise<unknown>;
          },
        ]
      >;
      const managerConfig = managerCalls[0]?.[0];
      if (!managerConfig) throw new Error("Manager was not constructed");
      await managerConfig.signer(hash);
      return response;
    });

    const { result } = renderHook(() =>
      useSendUserOperation({
        rpcUrl: "https://rpc.example",
        bundlerUrl: "https://bundler.example",
      }),
    );

    await act(async () => {
      await expect(result.current.sendUserOp(calls)).resolves.toEqual(response);
    });

    expect(request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: [hash, OWNER],
    });
  });

  it("rejects a chain mismatch before constructing a manager", async () => {
    setup({ chainId: "eip155:137" });
    const { result } = renderHook(() =>
      useSendUserOperation({
        rpcUrl: "https://rpc.example",
        bundlerUrl: "https://bundler.example",
        chainId: "eip155:1",
      }),
    );

    await act(async () => {
      await expect(result.current.sendUserOp(calls)).resolves.toBeNull();
    });

    expect(result.current.error?.message).toContain("does not match");
    expect(mocks.SmartAccountManager).not.toHaveBeenCalled();
  });

  it("does not allow a second operation while the first is in flight", async () => {
    let resolveSend!: (value: typeof response) => void;
    mocks.manager.sendUserOperation.mockReturnValue(
      new Promise<typeof response>((resolve) => {
        resolveSend = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useSendUserOperation({
        rpcUrl: "https://rpc.example",
        bundlerUrl: "https://bundler.example",
      }),
    );

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.sendUserOp(calls);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      await expect(result.current.sendUserOp(calls)).resolves.toBeNull();
    });
    expect(result.current.error?.message).toContain("already in progress");

    await act(async () => {
      resolveSend(response);
      await first;
    });
  });

  it("clears stale operation state when the wallet context changes", async () => {
    let resolveSend!: (value: typeof response) => void;
    mocks.manager.sendUserOperation.mockReturnValue(
      new Promise<typeof response>((resolve) => {
        resolveSend = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ chainId }: { chainId: string }) =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
          chainId,
        }),
      { initialProps: { chainId: "eip155:1" } },
    );

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.sendUserOp(calls);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    rerender({ chainId: "eip155:137" });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.userOpHash).toBeNull();

    await act(async () => {
      resolveSend(response);
      await first;
    });
    expect(result.current.userOpHash).toBeNull();
  });

  /**
   * Chain resolution.
   *
   * The hook used to fall back to `eip155:1` when neither an explicit chainId
   * nor a connected chain was available — and the chain-mismatch guard is
   * skipped on exactly that path, because it is conditioned on a connected
   * chain existing. A caller supplying its own signer needs no session, so the
   * branch is reachable: it would build and sign a UserOperation against
   * mainnet's EntryPoint while its bundler pointed elsewhere. The chain ID is
   * part of the hash the user approves.
   */
  describe("chain resolution", () => {
    it("refuses to assume a chain when none is known", async () => {
      setup({ chainId: null as never, activeSession: null });
      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
          signer: async () => `0x${"11".repeat(65)}`,
        }),
      );

      await act(async () => {
        await expect(result.current.sendUserOp(calls)).resolves.toBeNull();
      });
      expect(mocks.manager.sendUserOperation).not.toHaveBeenCalled();
      expect(result.current.error?.message).toMatch(/No EVM chain/);
    });

    it("refuses a malformed chain rather than falling back", async () => {
      setup({ chainId: "eip155:1" });
      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
          chainId: "mainnet",
        }),
      );

      await act(async () => {
        await expect(result.current.sendUserOp(calls)).resolves.toBeNull();
      });
      expect(mocks.manager.sendUserOperation).not.toHaveBeenCalled();
      expect(result.current.error?.message).toMatch(/Invalid EVM chain ID/);
    });

    it("still sends on the connected chain when no chainId is given", async () => {
      setup({ chainId: "eip155:137" });
      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
        }),
      );

      await act(async () => {
        await expect(result.current.sendUserOp(calls)).resolves.toEqual(
          response,
        );
      });
      const [config] = mocks.manager.sendUserOperation.mock.calls[0];
      expect(config.chainId).toBe("eip155:137");
    });
  });

  /**
   * Which wallets can own an ERC-4337 account.
   *
   * These two used to get the same refusal, but they are not the same
   * situation. An embedded wallet holds a secp256k1 key and only lacked a
   * primitive that signs a digest rather than text — a fixable gap, now fixed.
   * A passkey signs with P-256, which a SimpleAccount cannot verify at all; no
   * amount of wiring changes that, and the error has to say which case the
   * caller is in.
   */
  describe("signer eligibility", () => {
    const embeddedSession = { id: "emb", walletType: "embedded" } as never;

    it("signs a UserOperation with an embedded wallet's raw digest", async () => {
      const signHash = vi.fn().mockResolvedValue(`0x${"11".repeat(65)}`);
      mocks.useAccount.mockReturnValue({ evmAccount: `eip155:1:${OWNER}` });
      mocks.useWeb3.mockReturnValue({
        session: embeddedSession,
        chainId: "eip155:1",
        client: { embeddedConnector: { signHash } },
      });

      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
        }),
      );
      await act(async () => {
        await expect(result.current.sendUserOp(calls)).resolves.toEqual(
          response,
        );
      });

      // The signer is handed to the manager at construction. It must reach
      // signHash, not signMessage, which would prefix the hash's hex spelling.
      const [managerConfig] = mocks.SmartAccountManager.mock.calls[0];
      await managerConfig.signer(`0x${"ab".repeat(32)}`);
      expect(signHash).toHaveBeenCalledWith(
        embeddedSession,
        `0x${"ab".repeat(32)}`,
      );
    });

    it("names the actual reason a passkey cannot sign", async () => {
      mocks.useAccount.mockReturnValue({ evmAccount: `eip155:1:${OWNER}` });
      mocks.useWeb3.mockReturnValue({
        session: { id: "pk", walletType: "passkeys" } as never,
        chainId: "eip155:1",
        client: {},
      });

      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
        }),
      );
      await act(async () => {
        await result.current.sendUserOp(calls);
      });
      const [managerConfig] = mocks.SmartAccountManager.mock.calls[0];
      await expect(
        managerConfig.signer(`0x${"ab".repeat(32)}`),
      ).rejects.toThrow(/P-256/);
    });

    it("reports a missing primitive rather than a curve problem for embedded", async () => {
      mocks.useAccount.mockReturnValue({ evmAccount: `eip155:1:${OWNER}` });
      mocks.useWeb3.mockReturnValue({
        session: embeddedSession,
        chainId: "eip155:1",
        client: { embeddedConnector: {} },
      });

      const { result } = renderHook(() =>
        useSendUserOperation({
          rpcUrl: "https://rpc.example",
          bundlerUrl: "https://bundler.example",
        }),
      );
      await act(async () => {
        await result.current.sendUserOp(calls);
      });
      const [managerConfig] = mocks.SmartAccountManager.mock.calls[0];
      await expect(
        managerConfig.signer(`0x${"ab".repeat(32)}`),
      ).rejects.toThrow(/cannot sign a raw digest/);
    });
  });
});
