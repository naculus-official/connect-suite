/// <reference types="vitest" />
/// @vitest-environment jsdom

import type {
  MppSessionFetch,
  MppSessionFetchResult,
} from "@naculus/connect-appkit-core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

function result(
  over: Partial<MppSessionFetchResult> = {},
): MppSessionFetchResult {
  return { response: new Response("ok"), receipt, channel, ...over };
}

function sessionWith(fetchImpl: MppSessionFetch): MppSessionFetch {
  return fetchImpl;
}

function mockSession(): MppSessionFetch {
  let pending = 0n;
  const channels: unknown[] = [];
  const fetch = vi.fn().mockImplementation(async () => {
    pending = 0n;
    channels.splice(0, channels.length, channel);
    return result();
  });
  return sessionWith(
    Object.assign(fetch, {
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
        return result({ channel: null });
      }),
      forceClose: vi.fn().mockImplementation(async () => {
        channels.length = 0;
        return {
          requestCloseTxHash: "close-tx",
          withdrawPayer: vi.fn().mockResolvedValue("withdraw-tx"),
        };
      }),
    }),
  );
}

describe("useMppSession", () => {
  it("passes units through, tracks metering, channel, and receipt", async () => {
    const session = mockSession();
    const { result: hook } = renderHook(() => useMppSession(session));
    act(() => hook.current.meter.add(3n));
    expect(hook.current.pending).toBe(3n);
    await act(async () => {
      await hook.current.fetch(URL_, { method: "POST", units: 3n });
    });
    expect(session).toHaveBeenCalledWith(URL_, { method: "POST", units: 3n });
    expect(hook.current.pending).toBe(0n);
    expect(hook.current.channel?.channelId).toBe("channel-1");
    expect(hook.current.lastReceipt?.reference).toBe("tx-1");
    expect(hook.current.isPending).toBe(false);
  });

  it("records a recoverable channel id and rethrows the same Error", async () => {
    const failure = Object.assign(new Error("open_unacknowledged"), {
      channelId: "recovery-1",
    });
    const session = mockSession();
    vi.mocked(session).mockRejectedValueOnce(failure);
    const { result: hook } = renderHook(() => useMppSession(session));
    await act(async () => {
      await expect(hook.current.fetch(URL_)).rejects.toBe(failure);
    });
    expect(hook.current.error).toBe(failure);
    expect(hook.current.recoveryChannelId).toBe("recovery-1");
  });

  it("closes and force-closes while preserving returned results", async () => {
    const session = mockSession();
    const forced = await session.forceClose();
    vi.mocked(session.forceClose).mockResolvedValueOnce(forced);
    const { result: hook } = renderHook(() => useMppSession(session));
    let forceResult!: typeof forced;
    await act(async () => {
      await hook.current.fetch(URL_);
      await hook.current.close();
      forceResult = await hook.current.forceClose();
    });
    expect(forceResult).toBe(forced);
    await expect(forceResult.withdrawPayer()).resolves.toBe("withdraw-tx");
    expect(hook.current.channel).toBeNull();
  });

  it("keeps the session's open channel visible after reset", async () => {
    const session = mockSession();
    const { result: hook } = renderHook(() => useMppSession(session));
    await act(async () => {
      await hook.current.fetch(URL_);
    });
    act(() => hook.current.reset());
    expect(hook.current.channel).toEqual(channel);
    expect(hook.current.lastReceipt).toBeNull();
  });

  it("does not publish a late result after reset or unmount", async () => {
    let finish!: (value: MppSessionFetchResult) => void;
    const session = mockSession();
    vi.mocked(session).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const { result: hook, unmount } = renderHook(() => useMppSession(session));
    let pending!: Promise<MppSessionFetchResult>;
    act(() => {
      pending = hook.current.fetch(URL_);
      hook.current.reset();
    });
    await act(async () => {
      finish(result());
      await pending;
    });
    expect(hook.current.channel).toBeNull();
    expect(hook.current.isPending).toBe(false);

    act(() => {
      pending = hook.current.fetch(URL_);
    });
    unmount();
    finish(result());
    await pending;
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
    const { result: hook } = renderHook(() => useMppSession(session));
    let open!: Promise<MppSessionFetchResult>;
    let waiting!: Promise<MppSessionFetchResult>;
    act(() => {
      open = hook.current.fetch(URL_);
      waiting = hook.current.fetch(URL_);
    });
    (session.channels as unknown[]).push(channel);
    await act(async () => {
      finishOpen(result());
      await open;
    });
    expect(hook.current.channel).toBe(channel);
    expect(hook.current.lastReceipt).toBe(receipt);
    await act(async () => {
      failWaiting(new Error("No metered units"));
      await expect(waiting).rejects.toThrow("No metered units");
    });
    expect(hook.current.channel).toBe(channel);
    expect(hook.current.lastReceipt).toBe(receipt);
  });

  it("does not resurrect a channel when an older voucher settles after close", async () => {
    let finishVoucher!: (value: MppSessionFetchResult) => void;
    const session = mockSession();
    (session.channels as unknown[]).push(channel);
    vi.mocked(session).mockImplementationOnce(
      () => new Promise((resolve) => (finishVoucher = resolve)),
    );
    const { result: hook } = renderHook(() => useMppSession(session));
    let voucher!: Promise<MppSessionFetchResult>;
    act(() => {
      voucher = hook.current.fetch(URL_);
    });
    await act(async () => {
      await hook.current.close();
      finishVoucher(result());
      await voucher;
    });
    expect(hook.current.channel).toBeNull();
  });

  it("memoizes meter and resets state when the session changes", async () => {
    const first = mockSession();
    const second = mockSession();
    (second.channels as unknown[]).push({ ...channel, channelId: "channel-2" });
    const { result: hook, rerender } = renderHook(
      ({ value }) => useMppSession(value),
      { initialProps: { value: first } },
    );
    const meter = hook.current.meter;
    rerender({ value: first });
    expect(hook.current.meter).toBe(meter);
    rerender({ value: second });
    expect(hook.current.channel?.channelId).toBe("channel-2");
    expect(hook.current.lastReceipt).toBeNull();
  });
});
