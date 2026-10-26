/// <reference types="vitest" />
/// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useUserOpStatus } from "./useUserOpStatus";

/**
 * Polling for a UserOperation receipt, previously 0% covered.
 *
 * The no-receipt path gave up after maxRetries and set a terminal state. The
 * network-error path had the same retry budget but no terminal branch: once
 * exhausted it simply stopped scheduling, leaving isPolling true, status
 * "pending", no error, and the elapsed-time interval still counting. A caller
 * watched a spinner for a result that was never coming.
 */

const HASH = `0x${"ab".repeat(32)}` as `0x${string}`;
const OTHER_HASH = `0x${"cd".repeat(32)}` as `0x${string}`;
const bundlerUrl = "https://bundler.example/rpc";

const receipt = (success: boolean, userOpHash = HASH) => ({
  userOpHash,
  entryPoint: `0x${"11".repeat(20)}`,
  sender: `0x${"22".repeat(20)}`,
  nonce: "1",
  actualGasUsed: "21000",
  actualGasCost: "1000000000",
  success,
  transactionHash: HASH,
  logs: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function respondWith(impl: () => Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const result = await impl();
      return { ok: true, status: 200, json: async () => result } as Response;
    }),
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("useUserOpStatus", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));
    expect(result.current.status).toBe("idle");
    expect(result.current.isPolling).toBe(false);
    expect(result.current.attempts).toBe(0);
  });

  it("reports a confirmed receipt", async () => {
    respondWith(async () => ({ result: receipt(true) }));
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("confirmed");
    expect(result.current.error).toBeNull();
  });

  it("auto-starts when the hash arrives after the first render", async () => {
    // The usual flow: the hash is only known once the operation was sent.
    respondWith(async () => ({ result: receipt(true) }));
    const { result, rerender } = renderHook(
      ({ hash }: { hash: `0x${string}` | null }) =>
        useUserOpStatus({ bundlerUrl, userOpHash: hash }),
      { initialProps: { hash: null as `0x${string}` | null } },
    );
    expect(result.current.status).toBe("idle");
    rerender({ hash: HASH });
    await waitFor(() => expect(result.current.status).toBe("confirmed"));
    expect(result.current.userOpHash).toBe(HASH);
  });

  it("does not auto-start with autoStart: false", () => {
    respondWith(async () => ({ result: receipt(true) }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, userOpHash: HASH, autoStart: false }),
    );
    expect(result.current.status).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed operation", async () => {
    respondWith(async () => ({ result: receipt(false) }));
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("failed");
  });

  it("reaches a terminal state when the bundler is unreachable", async () => {
    // The defect in one assertion: this used to hang on "pending" forever.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, pollInterval: 1, maxRetries: 0 }),
    );
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("not_found");
    expect(result.current.error?.message).toMatch(/unavailable/);
  });

  it("names the underlying network failure in the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, pollInterval: 1, maxRetries: 0 }),
    );
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toMatch(/ECONNREFUSED/);
  });

  it("gives up when the operation never lands", async () => {
    respondWith(async () => ({ result: null }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, pollInterval: 1, maxRetries: 0 }),
    );
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("not_found");
    expect(result.current.error).not.toBeNull();
  });

  it("stop() halts polling", async () => {
    respondWith(async () => ({ result: null }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, pollInterval: 50 }),
    );
    act(() => result.current.start(HASH));
    act(() => result.current.stop());
    expect(result.current.isPolling).toBe(false);
  });

  it("reset() returns to the initial state", async () => {
    respondWith(async () => ({ result: null }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, pollInterval: 50 }),
    );
    act(() => result.current.start(HASH));
    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
    expect(result.current.userOpHash).toBeNull();
    expect(result.current.attempts).toBe(0);
  });

  it("does nothing without a bundler URL", () => {
    const { result } = renderHook(() => useUserOpStatus({}));
    act(() => result.current.start(HASH));
    expect(result.current.status).toBe("not_found");
    expect(result.current.isPolling).toBe(false);
    expect(result.current.error?.message).toMatch(/Bundler URL/);
  });

  it("rejects a receipt for a different UserOperation hash", async () => {
    respondWith(async () => ({ result: receipt(true, OTHER_HASH) }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, maxRetries: 0 }),
    );
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("not_found");
    expect(result.current.receipt).toBeNull();
    expect(result.current.error?.message).toMatch(/does not match/);
  });

  it("rejects malformed receipt fields instead of confirming", async () => {
    respondWith(async () => ({
      result: { ...receipt(true), transactionHash: "0x1234" },
    }));
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, maxRetries: 0 }),
    );
    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));
    expect(result.current.status).toBe("not_found");
    expect(result.current.receipt).toBeNull();
    expect(result.current.error?.message).toMatch(/invalid execution result/);
  });

  it("does not publish a stale receipt after tracking a new hash", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          params: [typeof HASH];
        };
        const result =
          body.params[0] === HASH ? await first.promise : await second.promise;
        return {
          ok: true,
          status: 200,
          json: async () => ({ result }),
        } as Response;
      }),
    );
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));

    act(() => result.current.start(HASH));
    act(() => result.current.start(OTHER_HASH));
    second.resolve(receipt(true, OTHER_HASH));
    await waitFor(() => expect(result.current.status).toBe("confirmed"));
    first.resolve(receipt(true, HASH));
    await act(async () => Promise.resolve());

    expect(result.current.userOpHash).toBe(OTHER_HASH);
    expect(result.current.receipt?.userOpHash).toBe(OTHER_HASH);
  });

  it("does not publish an in-flight receipt after reset", async () => {
    const pending = deferred<unknown>();
    respondWith(async () => pending.promise);
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));

    act(() => result.current.start(HASH));
    act(() => result.current.reset());
    pending.resolve({ result: receipt(true) });
    await act(async () => Promise.resolve());

    expect(result.current.status).toBe("idle");
    expect(result.current.receipt).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it("does not publish an in-flight receipt after stop", async () => {
    const pending = deferred<unknown>();
    respondWith(async () => pending.promise);
    const { result } = renderHook(() => useUserOpStatus({ bundlerUrl }));

    act(() => result.current.start(HASH));
    act(() => result.current.stop());
    pending.resolve({ result: receipt(true) });
    await act(async () => Promise.resolve());

    expect(result.current.status).toBe("pending");
    expect(result.current.receipt).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it("terminates after an HTTP error exhausts the retry budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 }) as Response),
    );
    const { result } = renderHook(() =>
      useUserOpStatus({ bundlerUrl, maxRetries: 0 }),
    );

    act(() => result.current.start(HASH));
    await waitFor(() => expect(result.current.isPolling).toBe(false));

    expect(result.current.status).toBe("not_found");
    expect(result.current.error?.message).toMatch(/HTTP 503/);
  });
});
