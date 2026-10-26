/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Quote } from "./useExecuteRoute";
import { useExecuteRoute } from "./useExecuteRoute";

/**
 * Cross-chain route execution, previously 0% covered while being a public
 * export that moves funds.
 *
 * The properties here are the ones a caller cannot verify for itself: that a
 * second press cannot submit the same route twice, that a failure never leaves
 * a previous run's transaction hash on screen, and that awaiting `execute`
 * tells you whether the funds moved rather than making you wait a render.
 */

const quote: Quote = { routeId: "r1", provider: "lifi" };
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const result = { fromTxHash: "0xfrom", toTxHash: "0xto" };

describe("useExecuteRoute", () => {
  it("starts idle", () => {
    const { result: hook } = renderHook(() => useExecuteRoute(vi.fn()));
    expect(hook.current.executing).toBe(false);
    expect(hook.current.result).toBeNull();
    expect(hook.current.error).toBeNull();
  });

  it("returns the result to the awaiting caller", async () => {
    // Not only stored on state: after `await execute(...)` the caller holds a
    // binding from the render before, so state cannot answer "did it send".
    const { result: hook } = renderHook(() =>
      useExecuteRoute(vi.fn().mockResolvedValue(result)),
    );
    let returned: unknown;
    await act(async () => {
      returned = await hook.current.execute(quote, RECIPIENT);
    });
    expect(returned).toEqual(result);
    expect(hook.current.result).toEqual(result);
  });

  it("passes the quote, recipient and options through untouched", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    const options = { timeoutMs: 1000, gasLimit: 21000n };
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT, options);
    });
    expect(execute).toHaveBeenCalledWith(quote, RECIPIENT, options);
  });

  it("returns null and records the error on failure", async () => {
    const { result: hook } = renderHook(() =>
      useExecuteRoute(
        vi.fn().mockRejectedValue(
          Object.assign(new Error("bridge down"), {
            code: "bridge_unavailable",
            details: { provider: "lifi" },
          }),
        ),
      ),
    );
    let returned: unknown = "unset";
    await act(async () => {
      returned = await hook.current.execute(quote, RECIPIENT);
    });
    expect(returned).toBeNull();
    expect(hook.current.error).toEqual({
      code: "bridge_unavailable",
      message: "bridge down",
      details: { provider: "lifi" },
    });
    expect(hook.current.executing).toBe(false);
  });

  it("defaults the error code when the executor gave none", async () => {
    const { result: hook } = renderHook(() =>
      useExecuteRoute(vi.fn().mockRejectedValue(new Error("boom"))),
    );
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(hook.current.error?.code).toBe("execution_failed");
  });

  it("refuses a second execution while one is in flight", async () => {
    // A double-pressed button must not submit a cross-chain transfer twice.
    let release!: (value: typeof result) => void;
    const execute = vi.fn(
      () => new Promise<typeof result>((resolve) => (release = resolve)),
    );
    const { result: hook } = renderHook(() => useExecuteRoute(execute));

    let first!: Promise<unknown>;
    await act(async () => {
      first = hook.current.execute(quote, RECIPIENT);
      await Promise.resolve();
    });

    let second: unknown = "unset";
    await act(async () => {
      second = await hook.current.execute(quote, RECIPIENT);
    });
    expect(second).toBeNull();
    expect(hook.current.error?.code).toBe("execution_in_progress");
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(result);
      await first;
    });
  });

  it("allows a new execution once the previous one settles", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("releases the guard after a failure", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(hook.current.result).toEqual(result);
  });

  it("does not leave a previous transaction hash beside a new error", async () => {
    // "Tx: 0xfrom" next to "No executeRoute function provided" reads as though
    // something was sent.
    const { result: hook, rerender } = renderHook(
      (props: { fn?: () => Promise<typeof result> }) =>
        useExecuteRoute(props.fn),
      {
        initialProps: {
          fn: vi.fn().mockResolvedValue(result) as
            | (() => Promise<typeof result>)
            | undefined,
        },
      },
    );
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(hook.current.result).toEqual(result);

    rerender({ fn: undefined });
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(hook.current.error?.code).toBe("no_executor");
    expect(hook.current.result).toBeNull();
  });

  it("stops writing state after unmount", async () => {
    // mountedRef was initialized true and never cleared, so every guard on it
    // was dead code.
    let release!: (value: typeof result) => void;
    const execute = vi.fn(
      () => new Promise<typeof result>((resolve) => (release = resolve)),
    );
    const { result: hook, unmount } = renderHook(() =>
      useExecuteRoute(execute),
    );

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.current.execute(quote, RECIPIENT);
      await Promise.resolve();
    });

    unmount();
    const errors: unknown[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((e) => errors.push(e));
    await act(async () => {
      release(result);
      await pending;
    });
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it("resets state", async () => {
    const { result: hook } = renderHook(() =>
      useExecuteRoute(vi.fn().mockResolvedValue(result)),
    );
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    act(() => hook.current.reset());
    await waitFor(() => {
      expect(hook.current.result).toBeNull();
      expect(hook.current.error).toBeNull();
      expect(hook.current.executing).toBe(false);
    });
  });

  it("reset does not unlock an execution still in flight", async () => {
    // The request is already with the executor; unlocking here would permit
    // the double submission the guard exists to prevent.
    let release!: (value: typeof result) => void;
    const execute = vi.fn(
      () => new Promise<typeof result>((resolve) => (release = resolve)),
    );
    const { result: hook } = renderHook(() => useExecuteRoute(execute));

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = hook.current.execute(quote, RECIPIENT);
      await Promise.resolve();
    });
    act(() => hook.current.reset());
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(execute).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(result);
      await pending;
    });
  });

  it("errors without an executor rather than doing nothing", async () => {
    const { result: hook } = renderHook(() => useExecuteRoute(undefined));
    let returned: unknown = "unset";
    await act(async () => {
      returned = await hook.current.execute(quote, RECIPIENT);
    });
    expect(returned).toBeNull();
    expect(hook.current.error?.code).toBe("no_executor");
    expect(hook.current.executing).toBe(false);
  });
});

/**
 * Recipient validation.
 *
 * The hook's own Quote type dropped every field describing the route, so it
 * had nothing to validate against — an EVM-shaped check would have rejected
 * every legitimate Solana and XRPL recipient. `toChain` is optional so the
 * existing contract is unchanged; supplying it opts into a namespace-correct
 * check using the same validator the connectors use.
 */
describe("useExecuteRoute — recipient", () => {
  const SOLANA = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtPb";
  const XRPL = "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w";

  const run = async (q: Quote, recipient: string) => {
    const execute = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    let returned: unknown = "unset";
    await act(async () => {
      returned = await hook.current.execute(q, recipient);
    });
    return { execute, hook, returned };
  };

  it("refuses an empty recipient on any chain", async () => {
    // Wrong everywhere, so it needs no destination chain to be sure.
    const { execute, hook, returned } = await run(quote, "   ");
    expect(returned).toBeNull();
    expect(hook.current.error?.code).toBe("invalid_recipient");
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not judge a recipient when the quote names no destination", async () => {
    // Current behavior preserved: with nothing to validate against, the
    // executor decides.
    const { execute } = await run(quote, "definitely-not-an-address");
    expect(execute).toHaveBeenCalled();
  });

  it.each([
    ["eip155:1", "0x1111111111111111111111111111111111111111"],
    ["eip155:137", "0x2222222222222222222222222222222222222222"],
    ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", SOLANA],
    ["xrpl:0", XRPL],
  ])("accepts a valid recipient for %s", async (toChain, recipient) => {
    // The point of using the namespace-aware validator: a base58 Solana
    // address and an r-prefixed XRPL address must both pass.
    const { execute } = await run({ ...quote, toChain }, recipient);
    expect(execute).toHaveBeenCalled();
  });

  it.each([
    ["eip155:1", SOLANA],
    [
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "0x1111111111111111111111111111111111111111",
    ],
    ["xrpl:0", "0x1111111111111111111111111111111111111111"],
  ])(
    "refuses a recipient from the wrong namespace on %s",
    async (toChain, recipient) => {
      const { execute, hook, returned } = await run(
        { ...quote, toChain },
        recipient,
      );
      expect(returned).toBeNull();
      expect(hook.current.error?.code).toBe("invalid_recipient");
      expect(hook.current.error?.message).toContain(toChain);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("does not leave a previous transaction hash beside a rejection", async () => {
    const execute = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    await act(async () => {
      await hook.current.execute(quote, RECIPIENT);
    });
    expect(hook.current.result).toEqual(result);

    await act(async () => {
      await hook.current.execute({ ...quote, toChain: "eip155:1" }, "nonsense");
    });
    expect(hook.current.result).toBeNull();
  });

  it("does not consume the concurrency guard on a rejected recipient", async () => {
    // Refusing before anything is sent must not lock out the corrected retry.
    const execute = vi.fn().mockResolvedValue(result);
    const { result: hook } = renderHook(() => useExecuteRoute(execute));
    await act(async () => {
      await hook.current.execute({ ...quote, toChain: "eip155:1" }, "nonsense");
    });
    await act(async () => {
      await hook.current.execute(
        { ...quote, toChain: "eip155:1" },
        "0x1111111111111111111111111111111111111111",
      );
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(hook.current.result).toEqual(result);
  });
});
