import type {
  SmartAccountInfo,
  SmartAccountManager,
} from "@naculus/connect-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import { useSendUserOperation } from "./useSendUserOperation";
import { useSmartAccount } from "./useSmartAccount";
import { useUserOpStatus } from "./useUserOpStatus";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const ACCOUNT = "0x2222222222222222222222222222222222222222" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

function fakeManager(deployed = false) {
  const info = (isDeployed: boolean): SmartAccountInfo =>
    ({
      address: ACCOUNT,
      isDeployed,
      owner: OWNER,
    }) as unknown as SmartAccountInfo;
  let state = deployed;
  return {
    createAccount: vi.fn(async () => info(state)),
    getAccountAddress: vi.fn(async () => ACCOUNT),
    getDeployCallData: vi.fn(async () => {
      state = true;
      return { to: OWNER, data: "0x5fbfb9cf" as const, value: 0n };
    }),
  } as unknown as SmartAccountManager & {
    createAccount: ReturnType<typeof vi.fn>;
    getDeployCallData: ReturnType<typeof vi.fn>;
  };
}

describe("useSmartAccount (Vue)", () => {
  it("derives config from owner and chain, creates, and deploys through the caller's sender", async () => {
    const manager = fakeManager();
    const send = vi.fn(async () => `0x${"cd".repeat(32)}` as const);
    const { api } = inScope(() =>
      useSmartAccount({
        account: `eip155:1:${OWNER}`,
        connectedChainId: "eip155:1",
        rpcUrl: "https://rpc",
        manager,
        sendTransaction: send,
      }),
    );
    await nextTick();
    expect(api.config.value).toMatchObject({
      owner: OWNER,
      chainId: "eip155:1",
    });

    const created = await api.createWallet();
    expect(created?.address).toBe(ACCOUNT);
    expect(api.isDeployed.value).toBe(false);

    const hash = await api.deployWallet();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: OWNER,
        data: "0x5fbfb9cf",
        value: "0",
        chainId: "eip155:1",
      }),
    );
    expect(hash).toMatch(/^0x/);
    expect(api.isDeployed.value).toBe(true);
    expect(api.isLoading.value).toBe(false);
  });

  it("does nothing without a chain, and refuses deploy without a sender", async () => {
    const manager = fakeManager();
    const chain = ref<string | undefined>(undefined);
    const { api } = inScope(() =>
      useSmartAccount({
        account: OWNER,
        connectedChainId: chain,
        rpcUrl: "https://rpc",
        manager,
      }),
    );
    await nextTick();
    expect(api.config.value).toBeNull();
    expect(await api.createWallet()).toBeNull();
    expect(api.error.value?.message).toMatch(/not configured/);

    chain.value = "eip155:10";
    await nextTick();
    expect(await api.deployWallet()).toBeNull();
    expect(api.error.value?.message).toMatch(/sendTransaction/);
    expect(manager.getDeployCallData).not.toHaveBeenCalled();
  });
});

describe("useSendUserOperation (Vue)", () => {
  it("fails closed before signing on missing config, chain mismatch or empty calls", async () => {
    const signer = vi.fn(async () => "0xabcd" as const);
    const { api } = inScope(() =>
      useSendUserOperation({
        account: OWNER,
        connectedChainId: "eip155:1",
        rpcUrl: "https://rpc",
        bundlerUrl: "https://bundler",
        chainId: "eip155:10",
        signer,
      }),
    );
    expect(await api.sendUserOp([])).toBeNull();
    expect(api.error.value?.message).toMatch(/At least one call/);
    expect(
      await api.sendUserOp([{ to: OWNER, value: 0n, data: "0x" }]),
    ).toBeNull();
    expect(api.error.value).toMatchObject({ code: "chain_mismatch" });
    expect(signer).not.toHaveBeenCalled();
    expect(api.isPending.value).toBe(false);
  });
});

describe("useUserOpStatus (Vue)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls until a valid receipt arrives and stops on a malformed one", async () => {
    const good = {
      userOpHash: HASH,
      entryPoint: OWNER,
      sender: ACCOUNT,
      nonce: "0x1",
      actualGasUsed: "0x1",
      actualGasCost: "0x1",
      success: true,
      transactionHash: `0x${"ef".repeat(32)}`,
      logs: [],
    };
    const responses = [
      { ok: true, json: async () => ({ result: null }) },
      { ok: true, json: async () => ({ result: good }) },
      { ok: true, json: async () => ({ result: { ...good, sender: "0x1" } }) },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responses.shift()),
    );

    const { api } = inScope(() =>
      useUserOpStatus({ bundlerUrl: "https://bundler", pollInterval: 100 }),
    );
    api.start(HASH);
    await vi.advanceTimersByTimeAsync(10);
    expect(api.status.value).toBe("pending");
    expect(api.attempts.value).toBe(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.status.value).toBe("confirmed");
    expect(api.receipt.value?.transactionHash).toBe(good.transactionHash);
    expect(api.isPolling.value).toBe(false);

    api.start(HASH);
    await vi.advanceTimersByTimeAsync(10);
    expect(api.status.value).toBe("not_found");
    expect(api.error.value?.name).toBe("InvalidUserOperationReceiptError");
    expect(api.receipt.value).toBeNull();
  });
});

describe("review follow-ups", () => {
  it("useSmartAccount drops a slow result after the chain changed, without a transient write", async () => {
    let release!: (info: SmartAccountInfo) => void;
    const manager = {
      createAccount: vi.fn(
        () =>
          new Promise<SmartAccountInfo>((resolve) => {
            release = resolve;
          }),
      ),
      getAccountAddress: vi.fn(),
      getDeployCallData: vi.fn(),
    } as unknown as SmartAccountManager;
    const chain = ref<string | undefined>("eip155:1");
    const { api } = inScope(() =>
      useSmartAccount({
        account: OWNER,
        connectedChainId: chain,
        rpcUrl: "https://rpc",
        manager,
      }),
    );
    await nextTick();
    const pending = api.createWallet();
    chain.value = "eip155:10";
    await nextTick();
    release({
      address: ACCOUNT,
      isDeployed: true,
      owner: OWNER,
    } as unknown as SmartAccountInfo);
    expect(await pending).toBeNull();
    expect(api.address.value).toBeNull();
    expect(api.isDeployed.value).toBe(false);
    expect(api.accountInfo.value).toBeNull();
  });

  it("useSendUserOperation keeps single-flight locked across reset() until the first send settles", async () => {
    let release!: () => void;
    const signer = vi.fn(async () => "0xabcd" as const);
    const { api } = inScope(() =>
      useSendUserOperation({
        account: OWNER,
        connectedChainId: "eip155:1",
        rpcUrl: "https://rpc",
        bundlerUrl: "https://bundler",
        signer,
      }),
    );
    // Hold the dynamic import so the first send stays in flight.
    const original = (globalThis as { fetch?: unknown }).fetch;
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = api.sendUserOp([{ to: OWNER, value: 0n, data: "0x" }]);
    await nextTick();
    api.reset();
    expect(
      await api.sendUserOp([{ to: OWNER, value: 0n, data: "0x" }]),
    ).toBeNull();
    expect(api.error.value?.message).toMatch(/already in progress/);
    release();
    void gate;
    void first;
    vi.stubGlobal("fetch", original);
  });
});
