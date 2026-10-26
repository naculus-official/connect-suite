import type { BatchCall, CallsStatus } from "@naculus/connect-core";
import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import type {
  ExecuteCallsAction,
  ExecutionPreview,
  GetCallsStatusAction,
  SendCallsAction,
  ShowCallsStatusAction,
} from "./eip5792";
import { useExecuteCalls } from "./useExecuteCalls";
import { useSendCalls } from "./useSendCalls";

const calls: BatchCall[] = [{ to: "0xabc", data: "0x1234", value: "0" }];
const callsStatus: CallsStatus = {
  version: "1.0",
  id: "0xbundle",
  chainId: "0x1",
  status: 200,
  atomic: true,
  receipts: [],
};

describe("Vue EIP-5792 shells", () => {
  it.each([
    [
      { code: -32603, message: "in-flight transaction limit reached" },
      /in-flight transaction limit reached \(code -32603\)/,
    ],
    [new Error("User rejected"), /User rejected/],
    ["wallet unavailable", /wallet unavailable/],
  ])("preserves a send rejection reason", async (rejection, expected) => {
    const scope = effectScope();
    const state = scope.run(() =>
      useSendCalls({
        sendCalls: vi.fn().mockRejectedValue(rejection),
        getCallsStatus: vi.fn<GetCallsStatusAction>(),
        showCallsStatus: vi.fn<ShowCallsStatusAction>(),
      }),
    )!;

    await expect(state.sendCalls(calls)).rejects.toThrow(expected);
    expect(state.error.value?.message).toMatch(expected);
    scope.stop();
  });

  it("passes send inputs and action results unchanged", async () => {
    const first = vi.fn<SendCallsAction>().mockResolvedValue("0xfirst");
    const second = vi.fn<SendCallsAction>().mockResolvedValue("0xbundle");
    const sendCalls = ref<SendCallsAction>(first);
    const getCallsStatus = vi.fn().mockResolvedValue(callsStatus);
    const showCallsStatus = vi.fn().mockResolvedValue(true);
    const execution = ref<"atomic-batch" | "sequential" | null>("atomic-batch");
    const input = {
      chainId: "eip155:1",
      strategy: "atomic-batch" as const,
      paymasterService: { url: "https://paymaster.example" },
    };
    const scope = effectScope();
    const state = scope.run(() =>
      useSendCalls({ sendCalls, getCallsStatus, showCallsStatus, execution }),
    )!;

    sendCalls.value = second;
    await expect(state.sendCalls(calls, input)).resolves.toBe("0xbundle");
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls[0]![0]).toBe(calls);
    expect(second.mock.calls[0]![1]).toBe(input);
    expect(state.batchHash.value).toBe("0xbundle");
    expect(state.execution.value).toBe("atomic-batch");

    await expect(state.getCallsStatus("0xbundle")).resolves.toBe(callsStatus);
    expect(getCallsStatus).toHaveBeenCalledWith("0xbundle");
    expect(state.callsStatus.value).toBe(callsStatus);
    await expect(state.showCallsStatus("0xbundle")).resolves.toBe(true);
    expect(showCallsStatus).toHaveBeenCalledWith("0xbundle");
    scope.stop();
  });

  it("does not publish an older send after reset", async () => {
    let resolve!: (hash: string) => void;
    const sendCalls = vi.fn(
      () => new Promise<string>((done) => (resolve = done)),
    );
    const scope = effectScope();
    const state = scope.run(() =>
      useSendCalls({
        sendCalls,
        getCallsStatus: vi.fn<GetCallsStatusAction>(),
        showCallsStatus: vi.fn<ShowCallsStatusAction>(),
      }),
    )!;

    const pending = state.sendCalls(calls);
    state.reset();
    resolve("0xlate");
    await pending;
    expect(state.status.value).toBe("idle");
    expect(state.batchHash.value).toBeNull();
    scope.stop();
  });

  it("publishes only the newest status read and drops one invalidated by reset", async () => {
    const resolvers: Array<(status: CallsStatus) => void> = [];
    const getCallsStatus = vi.fn<GetCallsStatusAction>(
      () => new Promise<CallsStatus>((done) => resolvers.push(done)),
    );
    const scope = effectScope();
    const state = scope.run(() =>
      useSendCalls({
        sendCalls: vi.fn<SendCallsAction>(),
        getCallsStatus,
        showCallsStatus: vi.fn<ShowCallsStatusAction>(),
      }),
    )!;

    const older = state.getCallsStatus("0xolder");
    const newer = state.getCallsStatus("0xnewer");
    const newestStatus: CallsStatus = {
      ...callsStatus,
      id: "0xnewer",
      status: 100,
    };
    resolvers[1]!(newestStatus);
    await newer;
    expect(state.callsStatus.value).toBe(newestStatus);
    resolvers[0]!(callsStatus);
    await older;
    expect(state.callsStatus.value).toBe(newestStatus);

    const invalidated = state.getCallsStatus("0xreset");
    state.reset();
    resolvers[2]!(callsStatus);
    await invalidated;
    expect(state.callsStatus.value).toBeNull();
    scope.stop();
  });

  it("delegates preview, execute, route, and reset without policy changes", async () => {
    const previewResult: ExecutionPreview = {
      strategy: "atomic-batch",
      atomic: true,
      sponsored: false,
      reason: "caller plan",
      route: "wallet-batch",
    };
    const preview = vi.fn().mockReturnValue(previewResult);
    const first = vi.fn<ExecuteCallsAction>().mockResolvedValue("0xfirst");
    const second = vi.fn<ExecuteCallsAction>().mockResolvedValue("0xresult");
    const execute = ref<ExecuteCallsAction>(first);
    const lastRoute = ref<
      "wallet-batch" | "user-operation" | "sequential" | null
    >("wallet-batch");
    const reset = vi.fn();
    const scope = effectScope();
    const state = scope.run(() =>
      useExecuteCalls({ preview, execute, lastRoute, reset }),
    )!;

    expect(state.preview(1, "required")).toBe(previewResult);
    expect(preview).toHaveBeenCalledWith(1, "required");
    execute.value = second;
    await expect(state.execute(calls, "preferred")).resolves.toBe("0xresult");
    expect(first).not.toHaveBeenCalled();
    expect(second.mock.calls[0]![0]).toBe(calls);
    expect(second.mock.calls[0]![1]).toBe("preferred");
    expect(state.lastRoute.value).toBe("wallet-batch");
    state.reset();
    expect(reset).toHaveBeenCalledTimes(1);
    scope.stop();
  });
});
