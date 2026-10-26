import {
  REVOKE_DELEGATE,
  type UniversalWalletSession,
} from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref, shallowRef } from "vue";
import { useDelegate } from "./useDelegate";

const ACCOUNT = `0x${"1".repeat(40)}` as const;
const IMPL = "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B" as const;
const HASH = `0x${"ab".repeat(32)}`;
const session = { id: "embedded-1" } as unknown as UniversalWalletSession;

function setup(
  over: { chain?: number; allowlist?: string[]; connector?: object } = {},
) {
  const getTransactionCount = vi.fn(async () => 6);
  const sendDelegation = vi.fn(async (_s: unknown, request: object) => ({
    hash: HASH,
    authorization: { ...request, yParity: 0, r: "0x1", s: "0x2" },
  }));
  const account = ref<string | null>(`eip155:1:${ACCOUNT}`);
  const scope = effectScope();
  const result = scope.run(() =>
    useDelegate({
      connector: shallowRef(over.connector ?? { sendDelegation }),
      session,
      account,
      chainId: "eip155:1",
      client: { chain: { id: over.chain ?? 1 }, getTransactionCount },
      allowlist: over.allowlist ?? [IMPL],
    }),
  );
  if (!result) throw new Error("No composable result");
  return { result, scope, account, getTransactionCount, sendDelegation };
}

describe("useDelegate", () => {
  it("sends an allowlisted delegation with the computed nonces", async () => {
    const { result, sendDelegation, getTransactionCount, scope } = setup();
    await result.delegate(IMPL);
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
    expect(result.result.value?.hash).toBe(HASH);
    scope.stop();
  });

  it("refuses a connector without sendDelegation before reading the nonce", async () => {
    const { result, getTransactionCount, scope } = setup({ connector: {} });
    await result.delegate(IMPL);
    expect(result.error.value).toMatchObject({ code: "method_unsupported" });
    expect(getTransactionCount).not.toHaveBeenCalled();
    scope.stop();
  });

  it("refuses a delegate outside the allowlist, but always allows revoke", async () => {
    const { result, sendDelegation, scope } = setup({ allowlist: [] });
    await result.delegate(IMPL);
    expect(result.error.value).toMatchObject({ code: "method_not_allowed" });
    expect(sendDelegation).not.toHaveBeenCalled();
    await result.revoke();
    expect(sendDelegation.mock.calls[0]?.[1]).toMatchObject({
      address: REVOKE_DELEGATE,
    });
    expect(result.error.value).toBeNull();
    scope.stop();
  });

  it("refuses to read the nonce from an RPC on another chain", async () => {
    const { result, getTransactionCount, scope } = setup({ chain: 10 });
    await result.delegate(IMPL);
    expect(result.error.value).toMatchObject({ code: "chain_mismatch" });
    expect(getTransactionCount).not.toHaveBeenCalled();
    scope.stop();
  });

  it("drops a result that lands after the account changed, and stays single-flight", async () => {
    const { result, sendDelegation, account, scope } = setup();
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
    const first = result.delegate(IMPL);
    await vi.waitFor(() => expect(sendDelegation).toHaveBeenCalled());
    account.value = `eip155:1:0x${"2".repeat(40)}`;
    await result.revoke();
    expect(result.error.value?.message).toMatch(/already in progress/);
    release();
    await first;
    expect(result.result.value).toBeNull();
    expect(sendDelegation).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});
