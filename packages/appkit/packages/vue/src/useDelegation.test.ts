import { describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { type DelegationCodeReader, useDelegation } from "./useDelegation";

const FIRST = `0x${"1".repeat(40)}`;
const SECOND = `0x${"2".repeat(40)}`;
const DELEGATE = `0x${"3".repeat(40)}`;

function scoped<T>(run: () => T) {
  const scope = effectScope();
  const result = scope.run(run);
  if (!result) throw new Error("No composable result");
  return { result, scope };
}

describe("useDelegation", () => {
  it("distinguishes unread, delegated, and confirmed non-delegated", async () => {
    const getCode = vi
      .fn()
      .mockResolvedValueOnce(`0xef0100${"3".repeat(40)}`)
      .mockResolvedValueOnce("0x");
    const client: DelegationCodeReader = { getCode };
    const account = ref<string | null>(null);
    const { result, scope } = scoped(() => useDelegation(account, client));
    expect(result.delegated.value).toBeNull();
    expect(getCode).not.toHaveBeenCalled();

    account.value = `eip155:1:${FIRST}`;
    expect(result.delegated.value).toBeNull();
    await vi.waitFor(() => expect(result.delegated.value).toBe(true));
    expect(result.delegate.value).toBe(DELEGATE);
    expect(getCode).toHaveBeenCalledWith({ address: FIRST });

    account.value = SECOND;
    expect(result.delegated.value).toBeNull();
    await vi.waitFor(() => expect(result.delegated.value).toBe(false));
    scope.stop();
  });

  it("keeps failed reads unknown and ignores late results from old account or chain", async () => {
    let finish!: (code: `0x${string}`) => void;
    const getCode = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("RPC down"))
      .mockResolvedValueOnce("0x");
    const client: DelegationCodeReader = { getCode };
    const account = ref(FIRST);
    const chainId = ref("eip155:1");
    const { result, scope } = scoped(() =>
      useDelegation(account, client, chainId),
    );
    account.value = SECOND;
    await vi.waitFor(() =>
      expect(result.error.value?.message).toBe("RPC down"),
    );
    expect(result.delegated.value).toBeNull();
    finish(`0xef0100${"3".repeat(40)}`);
    await nextTick();
    expect(result.delegated.value).toBeNull();

    chainId.value = "eip155:137";
    expect(result.error.value).toBeNull();
    await vi.waitFor(() => expect(result.delegated.value).toBe(false));
    scope.stop();
  });

  it("does not turn invalid account or a disposed late read into a status", async () => {
    let finish!: (code: `0x${string}`) => void;
    const client: DelegationCodeReader = {
      getCode: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const account = ref("not-an-address");
    const { result, scope } = scoped(() => useDelegation(account, client));
    expect(result.delegated.value).toBeNull();
    account.value = FIRST;
    scope.stop();
    finish("0x");
    await nextTick();
    expect(result.delegated.value).toBeNull();
  });

  it("keeps the newest read when an older one resolves last", async () => {
    const reads: Array<(code: `0x${string}`) => void> = [];
    const client: DelegationCodeReader = {
      getCode: vi.fn(
        () =>
          new Promise<`0x${string}`>((resolve) => {
            reads.push(resolve);
          }),
      ),
    };
    const { result, scope } = scoped(() => useDelegation(FIRST, client));

    const callA = result.refetch();
    const callB = result.refetch();
    reads[2]!(`0xef0100${DELEGATE.slice(2)}`);
    await callB;
    reads[1]!("0x");
    reads[0]!("0x");
    await callA;
    expect(result.delegated.value).toBe(true);
    expect(result.delegate.value?.toLowerCase()).toBe(DELEGATE);
    expect(result.isFetching.value).toBe(false);
    scope.stop();
  });
});
