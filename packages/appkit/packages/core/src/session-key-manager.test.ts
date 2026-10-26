import { afterEach, describe, expect, it } from "vitest";
import {
  getSharedSessionKeyManager,
  resetSharedSessionKeyManager,
  sessionKeyConfigFingerprint,
} from "./session-key-manager";

afterEach(() => resetSharedSessionKeyManager());

describe("shared session-key manager", () => {
  it("returns one instance and refuses a second, different spending config", () => {
    const first = getSharedSessionKeyManager({ defaultMaxTxCount: 5 });
    expect(getSharedSessionKeyManager()).toBe(first);
    expect(getSharedSessionKeyManager({ defaultMaxTxCount: 5 })).toBe(first);
    expect(() => getSharedSessionKeyManager({ defaultMaxTxCount: 6 })).toThrow(
      /different spending configuration/,
    );
  });

  it("fingerprints only the fields that change limits or sealing", () => {
    expect(sessionKeyConfigFingerprint()).toBe("");
    expect(
      sessionKeyConfigFingerprint({
        defaultMaxTotalValue: 10n,
        forbiddenMethods: ["0x1"],
      }),
    ).toBe(
      sessionKeyConfigFingerprint({
        forbiddenMethods: ["0x1"],
        defaultMaxTotalValue: 10n,
      }),
    );
  });

  it("forgets the instance on reset", () => {
    const first = getSharedSessionKeyManager();
    resetSharedSessionKeyManager();
    expect(getSharedSessionKeyManager()).not.toBe(first);
  });
});
