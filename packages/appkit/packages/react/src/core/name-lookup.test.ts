/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetResolver = vi.fn();
vi.mock("@naculus/connect-appkit-core", () => ({
  getResolver: (config?: unknown) => mockGetResolver(config),
}));

import { useNameLookup } from "./name-lookup";

/**
 * The shared half of useResolveName and useLookupAddress.
 *
 * Both hooks were near-identical copies with identical defects, so these tests
 * cover the three that mattered: an earlier lookup landing after a later one
 * (which would pair one address with another's name), a resolver pinned to the
 * first render so a config change was ignored, and a de-duplication guard that
 * read `data` from a previous render.
 */

const resolver = { id: "shared" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetResolver.mockReturnValue(resolver);
});
afterEach(() => vi.restoreAllMocks());

const setup = (
  query: (...args: unknown[]) => Promise<unknown>,
  initial: { input: string; scope?: string; resolverConfig?: unknown } = {
    input: "vitalik.eth",
  },
) =>
  renderHook(
    (props: { input: string; scope?: string; resolverConfig?: unknown }) =>
      useNameLookup({ ...props, query } as never),
    { initialProps: initial },
  );

describe("useNameLookup — stale responses", () => {
  it("ignores an earlier lookup that resolves after a later one", async () => {
    // The dangerous case: typing quickly leaves two in flight, and the first
    // landing last would show one input's answer beside a different input.
    let releaseFirst!: (value: string) => void;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>((resolve) => (releaseFirst = resolve)),
      )
      .mockResolvedValueOnce("second-result");

    const { result, rerender } = setup(query, { input: "a.eth" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

    rerender({ input: "b.eth" });
    await waitFor(() => expect(result.current.data).toBe("second-result"));

    await act(async () => {
      releaseFirst("first-result");
      await Promise.resolve();
    });
    expect(result.current.data).toBe("second-result");
  });

  it("ignores a late failure from a superseded lookup", async () => {
    let rejectFirst!: (reason: Error) => void;
    const query = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<string>((_, reject) => (rejectFirst = reject)),
      )
      .mockResolvedValueOnce("second-result");

    const { result, rerender } = setup(query, { input: "a.eth" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    rerender({ input: "b.eth" });
    await waitFor(() => expect(result.current.data).toBe("second-result"));

    await act(async () => {
      rejectFirst(new Error("stale failure"));
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("second-result");
  });

  it("discards an in-flight lookup when the input is cleared", async () => {
    let release!: (value: string) => void;
    const query = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const { result, rerender } = setup(query, { input: "a.eth" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

    rerender({ input: "" });
    await act(async () => {
      release("late");
      await Promise.resolve();
    });
    // A cleared field must not fill itself in from a request the user
    // abandoned.
    expect(result.current.data).toBeNull();
  });
});

describe("useNameLookup — resolver selection", () => {
  it("uses the shared resolver when no config is given", async () => {
    const query = vi.fn().mockResolvedValue("x");
    setup(query);
    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(mockGetResolver).toHaveBeenCalledWith(undefined);
    expect(query.mock.calls[0][0]).toBe(resolver);
  });

  it("rebuilds when the caller changes resolverConfig", async () => {
    // Previously captured into a ref on first render and never revisited, so a
    // caller switching RPC endpoints kept querying the old one.
    const dedicated = { id: "dedicated" };
    mockGetResolver.mockImplementation((config) =>
      config ? dedicated : resolver,
    );
    const query = vi.fn().mockResolvedValue("x");
    const { rerender } = setup(query, { input: "a.eth" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));

    rerender({ input: "a.eth", resolverConfig: { rpcUrl: "https://other" } });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(query.mock.calls[1][0]).toBe(dedicated);
  });
});

describe("useNameLookup — behavior", () => {
  it("trims the input before querying", async () => {
    const query = vi.fn().mockResolvedValue("x");
    setup(query, { input: "  vitalik.eth  " });
    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(query.mock.calls[0][1]).toBe("vitalik.eth");
  });

  it("passes the scope through", async () => {
    const query = vi.fn().mockResolvedValue("x");
    setup(query, { input: "a.eth", scope: "eip155:1" });
    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(query.mock.calls[0][2]).toBe("eip155:1");
  });

  it("refetches when the scope changes", async () => {
    const query = vi.fn().mockResolvedValue("x");
    const { rerender } = setup(query, { input: "a.eth", scope: "eip155:1" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    rerender({ input: "a.eth", scope: "eip155:137" });
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });

  it("does not query an empty or whitespace-only input", async () => {
    const query = vi.fn().mockResolvedValue("x");
    const { result } = setup(query, { input: "   " });
    await act(async () => {
      await Promise.resolve();
    });
    expect(query).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it("treats a null result as an answer, not an error", async () => {
    // "No such name" is a finding; surfacing it as an error would make a UI
    // show a failure for a name that simply is not registered.
    const query = vi.fn().mockResolvedValue(null);
    const { result } = setup(query);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("records a failure and clears stale data", async () => {
    const query = vi.fn().mockRejectedValue(new Error("rpc down"));
    const { result } = setup(query);
    await waitFor(() => expect(result.current.error?.message).toBe("rpc down"));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("wraps a non-Error rejection", async () => {
    const query = vi.fn().mockRejectedValue("just a string");
    const { result } = setup(query);
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe("just a string");
  });

  it("refetch re-runs the query", async () => {
    const query = vi.fn().mockResolvedValue("x");
    const { result } = setup(query);
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    act(() => result.current.refetch());
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  });

  it("stops writing state after unmount", async () => {
    let release!: (value: string) => void;
    const query = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const { unmount } = setup(query);
    await waitFor(() => expect(query).toHaveBeenCalled());

    unmount();
    const errors: unknown[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((e) => errors.push(e));
    await act(async () => {
      release("late");
      await Promise.resolve();
    });
    spy.mockRestore();
    expect(errors).toEqual([]);
  });
});
