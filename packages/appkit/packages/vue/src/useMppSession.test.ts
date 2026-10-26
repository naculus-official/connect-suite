import type {
  MppSessionFetch,
  MppSessionFetchResult,
} from "@naculus/connect-appkit-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { useMppSession } from "./useMppSession";

const URL_ = "https://api.example.com/session";
const channel = {
  channelId: "channel-1",
  payer: "payer",
  payee: "payee",
  mint: "mint",
  channelProgram: "program",
  deposit: 100n,
  gracePeriodSeconds: 3600,
  openSlot: 9n,
  salt: 7n,
};
const receipt = {
  status: "success" as const,
  method: "solana",
  timestamp: "2026-09-30T00:00:00Z",
  reference: "tx-1",
};

function result(): MppSessionFetchResult {
  return { response: new Response("ok"), receipt, channel };
}

function mockSession(): MppSessionFetch {
  let pending = 0n;
  const channels: unknown[] = [];
  const fetch = vi.fn().mockImplementation(async () => {
    pending = 0n;
    channels.splice(0, channels.length, channel);
    return result();
  });
  return Object.assign(fetch, {
    meter: {
      add: vi.fn((units: bigint) => {
        if (units <= 0n) throw new Error("invalid_units");
        pending += units;
      }),
      get pending() {
        return pending;
      },
    },
    channels,
    close: vi.fn().mockImplementation(async () => {
      channels.length = 0;
      return { ...result(), channel: null };
    }),
    forceClose: vi.fn().mockImplementation(async () => {
      channels.length = 0;
      return {
        requestCloseTxHash: "close-tx",
        withdrawPayer: vi.fn().mockResolvedValue("withdraw-tx"),
      };
    }),
  });
}

function mount<T>(fn: () => T) {
  const scope = effectScope();
  return { hook: scope.run(fn) as T, scope };
}

describe("useMppSession", () => {
  it("tracks units, channel, receipt, close, and force-close results", async () => {
    const session = mockSession();
    const { hook, scope } = mount(() => useMppSession(session));
    hook.meter.add(4n);
    expect(hook.pending.value).toBe(4n);
    await hook.fetch(URL_, { units: 4n });
    expect(session).toHaveBeenCalledWith(URL_, { units: 4n });
    expect(hook.channel.value?.channelId).toBe("channel-1");
    expect(hook.lastReceipt.value?.reference).toBe("tx-1");
    await hook.close();
    const forced = await hook.forceClose();
    expect(forced.requestCloseTxHash).toBe("close-tx");
    await expect(forced.withdrawPayer()).resolves.toBe("withdraw-tx");
    expect(hook.channel.value).toBeNull();
    scope.stop();
  });

  it("uses the current session and publishes recoverable failures", async () => {
    const first = mockSession();
    const second = mockSession();
    const failure = Object.assign(new Error("open_unacknowledged"), {
      channelId: "recovery-1",
    });
    vi.mocked(second).mockRejectedValueOnce(failure);
    const session = ref(first);
    const { hook, scope } = mount(() => useMppSession(session));
    session.value = second;
    await expect(hook.fetch(URL_)).rejects.toBe(failure);
    expect(first).not.toHaveBeenCalled();
    expect(hook.error.value).toBe(failure);
    expect(hook.recoveryChannelId.value).toBe("recovery-1");
    scope.stop();
  });

  it("does not publish late results after reset or disposal", async () => {
    let finish!: (value: MppSessionFetchResult) => void;
    const session = mockSession();
    vi.mocked(session).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const { hook, scope } = mount(() => useMppSession(session));
    const pending = hook.fetch(URL_);
    hook.reset();
    finish(result());
    await pending;
    expect(hook.channel.value).toBeNull();
    expect(hook.isPending.value).toBe(false);

    const late = hook.fetch(URL_);
    scope.stop();
    finish(result());
    await late;
    expect(hook.channel.value).toBeNull();
  });

  it("keeps an opened channel and receipt when a newer first call fails", async () => {
    let finishOpen!: (value: MppSessionFetchResult) => void;
    let failWaiting!: (reason: Error) => void;
    const session = mockSession();
    vi.mocked(session)
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishOpen = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((_, reject) => (failWaiting = reject)),
      );
    const { hook, scope } = mount(() => useMppSession(session));
    const open = hook.fetch(URL_);
    const waiting = hook.fetch(URL_);
    (session.channels as unknown[]).push(channel);
    finishOpen(result());
    await open;
    expect(hook.channel.value).toBe(channel);
    expect(hook.lastReceipt.value).toBe(receipt);
    failWaiting(new Error("No metered units"));
    await expect(waiting).rejects.toThrow("No metered units");
    expect(hook.channel.value).toBe(channel);
    expect(hook.lastReceipt.value).toBe(receipt);
    scope.stop();
  });

  it("does not resurrect a channel when an older voucher settles after close", async () => {
    let finishVoucher!: (value: MppSessionFetchResult) => void;
    const session = mockSession();
    (session.channels as unknown[]).push(channel);
    vi.mocked(session).mockImplementationOnce(
      () => new Promise((resolve) => (finishVoucher = resolve)),
    );
    const { hook, scope } = mount(() => useMppSession(session));
    const voucher = hook.fetch(URL_);
    await hook.close();
    finishVoucher(result());
    await voucher;
    expect(hook.channel.value).toBeNull();
    scope.stop();
  });

  it("resets derived state when the session changes", async () => {
    const first = mockSession();
    const second = mockSession();
    (second.channels as unknown[]).push({ ...channel, channelId: "channel-2" });
    const session = ref(first);
    const { hook, scope } = mount(() => useMppSession(session));
    await hook.fetch(URL_);
    session.value = second;
    expect(hook.channel.value?.channelId).toBe("channel-2");
    expect(hook.lastReceipt.value).toBeNull();
    scope.stop();
  });
});
