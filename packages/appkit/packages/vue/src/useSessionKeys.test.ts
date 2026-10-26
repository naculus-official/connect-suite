import { resetSharedSessionKeyManager } from "@naculus/connect-appkit-core";
import { MemoryStorageAdapter, SessionKeyManager } from "@naculus/connect-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { inScope } from "../test-utils/scope";
import {
  useCreateSessionKey,
  useRevokeSession,
  useSendWithSession,
  useSessionKeys,
} from "./useSessionKeys";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;
const SIGNER = "0x2222222222222222222222222222222222222222" as const;
// Weak KDF is test-only: 600k PBKDF2 rounds per key would make this suite slow.
const fastManager = () =>
  new SessionKeyManager(
    { pbkdf2Iterations: 1_000, unsafeAllowWeakKdf: true },
    new MemoryStorageAdapter(),
  );

afterEach(() => resetSharedSessionKeyManager());

describe("session-key composables (Vue)", () => {
  it("creates, lists, and revokes through one caller-owned manager", async () => {
    const manager = fastManager();
    const connected = ref(false);
    const list = inScope(() =>
      useSessionKeys(connected, undefined, { manager }),
    ).api;
    const create = inScope(() =>
      useCreateSessionKey(undefined, { manager }),
    ).api;
    const revoke = inScope(() => useRevokeSession(undefined, { manager })).api;

    await nextTick();
    expect(list.sessions.value).toEqual([]);

    const info = await create.createSessionKey(
      { allowedContracts: [CONTRACT], rails: ["transfer"] },
      SIGNER,
    );
    expect(create.lastCreated.value?.id).toBe(info.id);
    expect(create.isCreating.value).toBe(false);

    connected.value = true;
    await nextTick();
    await vi.waitFor(() => expect(list.sessions.value).toHaveLength(1));
    expect(list.activeSessions.value).toHaveLength(1);

    await revoke.revokeSession(info.id);
    await list.refresh();
    expect(list.activeSessions.value).toHaveLength(0);
    expect(list.sessions.value[0]?.status).toBe("revoked");
  });

  it("refuses to sign an unauthorized key and surfaces the error without leaking a key", async () => {
    const manager = fastManager();
    const create = inScope(() =>
      useCreateSessionKey(undefined, { manager }),
    ).api;
    const send = inScope(() => useSendWithSession(undefined, { manager })).api;
    const info = await create.createSessionKey(
      { allowedContracts: [CONTRACT], rails: ["transfer"] },
      SIGNER,
    );

    const scope = await send.checkScope(info.id, { to: CONTRACT, value: "1" });
    expect(scope.valid).toBe(true);

    await expect(
      send.signWithSession(info.id, `0x${"ab".repeat(32)}`, { to: CONTRACT }),
    ).rejects.toMatchObject({ code: "session_key_invalid_input" });
    expect(send.error.value).toMatchObject({
      code: "session_key_invalid_input",
    });
    expect(send.isBusy.value).toBe(false);
    send.clearError();
    expect(send.error.value).toBeNull();
  });

  it("falls back to the shared manager and applies its config guard", () => {
    inScope(() => useCreateSessionKey({ defaultMaxTxCount: 3 }));
    expect(() =>
      inScope(() => useRevokeSession({ defaultMaxTxCount: 4 })),
    ).toThrow(/different spending configuration/);
  });
});
