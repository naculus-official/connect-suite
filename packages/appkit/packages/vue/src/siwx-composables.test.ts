import { describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import type { SiwxResult, SiwxSessionLike } from "./siwx";
import { useSIWxLogin } from "./useSIWxLogin";
import { useSIWxSession } from "./useSIWxSession";
import { useSignInWithX } from "./useSignInWithX";
import { useSiwxAuthSession } from "./useSiwxAuthSession";

const result: SiwxResult = {
  message: {
    chainId: "eip155:1",
    address: "0xabc",
    domain: "example.com",
  },
  signature: "0xsig",
};
const session: SiwxSessionLike = {
  id: "siwx_1",
  chainId: "eip155:1",
  address: "0xabc",
  domain: "example.com",
  message: result.message,
  signature: result.signature,
  issuedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  refreshedAt: null,
};

describe("Vue SIWX shells", () => {
  it("passes sign-in options and result unchanged", async () => {
    const action = vi.fn().mockResolvedValue(result);
    const input = { domain: "example.com", resources: ["urn:test"] };
    const scope = effectScope();
    const state = scope.run(() => useSignInWithX(action))!;
    await expect(state.signIn(input)).resolves.toBe(result);
    expect(action.mock.calls[0]![0]).toBe(input);
    expect(state.result.value).toBe(result);
    scope.stop();
  });

  it("exposes the login subset without changing the action", async () => {
    const action = vi.fn().mockResolvedValue(result);
    const scope = effectScope();
    const state = scope.run(() => useSIWxLogin(action))!;
    await expect(state.signIn()).resolves.toBe(result);
    expect(action).toHaveBeenCalledWith(undefined);
    scope.stop();
  });

  it("uses caller-owned session policy and lifecycle actions", async () => {
    const current = ref<SiwxSessionLike | null>(session);
    const expired = ref(false);
    const signIn = vi.fn().mockResolvedValue(session);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(session);
    const scope = effectScope();
    const state = scope.run(() =>
      useSIWxSession({
        session: current,
        isRestoring: false,
        isExpired: expired,
        timeUntilExpiry: null,
        signIn,
        signOut,
        refresh,
      }),
    )!;
    expect(state.isAuthenticated.value).toBe(true);
    expired.value = true;
    expect(state.isAuthenticated.value).toBe(false);
    await expect(state.refresh()).resolves.toBe(session);
    await state.signOut();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("reflects caller-validated auth and delegates persistence actions", async () => {
    const persisted = ref<SiwxResult | null>(result);
    const signIn = vi.fn().mockResolvedValue(result);
    const signOut = vi.fn().mockResolvedValue(undefined);
    const scope = effectScope();
    const state = scope.run(() =>
      useSiwxAuthSession({
        result: persisted,
        isRestoring: false,
        signIn,
        signOut,
      }),
    )!;
    expect(state.isSignedIn.value).toBe(true);
    await expect(state.signIn({ requestId: "request" })).resolves.toBe(result);
    expect(signIn).toHaveBeenCalledWith({ requestId: "request" });
    await state.signOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("prevents a reset result from being republished by an older sign-in", async () => {
    let resolve!: (value: SiwxResult) => void;
    const action = vi.fn(
      () => new Promise<SiwxResult>((done) => (resolve = done)),
    );
    const scope = effectScope();
    const state = scope.run(() => useSignInWithX(action))!;
    const pending = state.signIn();
    state.reset();
    resolve(result);
    await pending;
    expect(state.result.value).toBeNull();
    scope.stop();
  });
});
