/// <reference types="vitest" />
/// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseViemClient = vi.fn();
vi.mock("./useViemClient", () => ({
  useViemClient: () => mockUseViemClient(),
}));
const mockUseAccount = vi.fn();
vi.mock("./useAccount", () => ({
  useAccount: () => mockUseAccount(),
}));

import { useDelegation } from "./useDelegation";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAccount.mockReturnValue({
    evmAccount: "eip155:1:0x1234567890123456789012345678901234567890",
  });
});

describe("useDelegation", () => {
  it("does not let a slow code read repopulate delegation after disconnect", async () => {
    let resolveCode!: (value: `0x${string}`) => void;
    const code = new Promise<`0x${string}`>((resolve) => {
      resolveCode = resolve;
    });
    mockUseViemClient.mockReturnValue({
      publicClient: { getCode: vi.fn(() => code) },
    });
    const { result, rerender } = renderHook(() => useDelegation());
    await waitFor(() => expect(result.current.isFetching).toBe(true));

    mockUseAccount.mockReturnValue({ evmAccount: null });
    rerender();
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    await act(async () => {
      resolveCode(
        "0xef01001234567890123456789012345678901234567890" as `0x${string}`,
      );
      await code;
    });
    expect(result.current.delegated).toBeNull();
    expect(result.current.delegate).toBeNull();
  });
});
