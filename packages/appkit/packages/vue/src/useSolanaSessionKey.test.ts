import { describe, expect, it } from "vitest";
import { effectScope, nextTick, shallowRef } from "vue";
import {
  testSolanaDeps,
  testSolanaScope,
} from "../../../test-utils/solana-session-fixtures";
import { useSolanaSessionKey } from "./useSolanaSessionKey";

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("useSolanaSessionKey (Vue)", () => {
  it("creates an approved key and lists it", async () => {
    const scope = effectScope();
    const hook = scope.run(() => useSolanaSessionKey(testSolanaDeps()))!;
    const { key } = await hook.create(testSolanaScope());
    expect(key.status).toBe("active");
    expect(hook.keys.value.map((k) => k.id)).toEqual([key.id]);
    expect(hook.isPending.value).toBe(false);
    scope.stop();
  });

  it("publishes a declined approval and shows the key revoked", async () => {
    const scope = effectScope();
    const hook = scope.run(() =>
      useSolanaSessionKey(testSolanaDeps({ decline: true })),
    )!;
    await expect(hook.create(testSolanaScope())).rejects.toThrow(
      "user_rejected",
    );
    expect(hook.error.value?.message).toBe("user_rejected");
    expect(hook.keys.value[0]?.status).toBe("revoked");
    scope.stop();
  });

  it("revokes, and follows a change of dependencies", async () => {
    const deps = shallowRef<ReturnType<typeof testSolanaDeps> | null>(
      testSolanaDeps(),
    );
    const scope = effectScope();
    const hook = scope.run(() => useSolanaSessionKey(deps))!;
    const { key } = await hook.create(testSolanaScope());
    await hook.revoke(key.id);
    expect(hook.keys.value[0]?.status).toBe("revoked");
    deps.value = null;
    await nextTick();
    await settle();
    expect(hook.keys.value).toEqual([]);
    await expect(hook.create(testSolanaScope())).rejects.toThrow(
      /No Solana session key manager/,
    );
    scope.stop();
  });
});
