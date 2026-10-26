import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref, watch } from "vue";

const mocks = vi.hoisted(() => ({ simulate: vi.fn(), config: vi.fn() }));
vi.mock("@naculus/connect-core", async () => {
  const actual = await vi.importActual<typeof import("@naculus/connect-core")>(
    "@naculus/connect-core",
  );
  return {
    ...actual,
    SimulationManager: class {
      constructor(config: unknown) {
        mocks.config(config);
      }
      simulateERC20Transfer = mocks.simulate;
    },
  };
});

import { useSimulateTransfer } from "./useSimulateTransfer";

const address = `0x${"1".repeat(40)}` as `0x${string}`;
const success = { status: "success", summary: "ok" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.simulate.mockResolvedValue(success);
});

describe("useSimulateTransfer", () => {
  it("rejects missing chain and forwards reactive chain, RPC and decimals", async () => {
    const chainId = ref<number>();
    const rpcUrl = ref("https://first");
    const scope = effectScope();
    const hook = scope.run(() => useSimulateTransfer({ chainId, rpcUrl }))!;
    await expect(hook.simulate(address, address, address, "1")).rejects.toThrow(
      /No chain/,
    );
    expect(mocks.simulate).not.toHaveBeenCalled();
    chainId.value = 137;
    await hook.simulate(address, address, address, "1", {
      rpcUrl: "https://second",
      decimals: 6,
    });
    expect(mocks.simulate).toHaveBeenCalledWith(
      address,
      address,
      address,
      "1",
      137,
      6,
      "https://second",
    );
    expect(hook.result.value).toEqual(success);
    hook.reset();
    expect(hook.result.value).toBeNull();
    scope.stop();
  });

  it("does not restore result after disposal", async () => {
    let finish!: (value: unknown) => void;
    mocks.simulate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const scope = effectScope();
    const hook = scope.run(() => useSimulateTransfer({ chainId: 1 }))!;
    const pending = hook.simulate(address, address, address, "1");
    scope.stop();
    finish(success);
    await pending;
    expect(hook.result.value).toBeNull();
  });

  it("keeps the newest simulation when an older one resolves last", async () => {
    const answers: Array<(value: unknown) => void> = [];
    mocks.simulate.mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    const scope = effectScope();
    const hook = scope.run(() => useSimulateTransfer({ chainId: 1 }))!;

    const callA = hook.simulate(address, address, address, "1");
    const callB = hook.simulate(address, address, address, "2");
    const newest = { status: "success", summary: "B" };
    answers[1]!(newest);
    await callB;
    answers[0]!({ status: "reverted", summary: "A" });
    await callA;
    expect(hook.result.value).toBe(newest);
    expect(hook.loading.value).toBe(false);
    scope.stop();
  });

  it("rejects rather than throws when a sync loading watcher throws", async () => {
    const scope = effectScope();
    const failure = new Error("watcher");
    const hook = scope.run(() => {
      const state = useSimulateTransfer({ chainId: 1 });
      watch(
        state.loading,
        (busy) => {
          if (busy) throw failure;
        },
        { flush: "sync" },
      );
      return state;
    })!;

    let pending!: Promise<unknown>;
    expect(() => {
      pending = hook.simulate(address, address, address, "1");
    }).not.toThrow();
    await expect(pending).rejects.toBe(failure);
    scope.stop();
  });
});
