import { PassphraseGate } from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import { effectScope } from "vue";
import { usePassphraseGate } from "./usePassphraseGate";

/** `effectScope` rather than a test-renderer: it is what `onScopeDispose`
 *  actually hooks into, so cleanup is exercised for real. */
function inScope(gate: PassphraseGate) {
  const scope = effectScope();
  let api!: ReturnType<typeof usePassphraseGate>;
  scope.run(() => {
    api = usePassphraseGate(gate);
  });
  return { api, scope };
}

describe("usePassphraseGate (Vue)", () => {
  it("starts with whatever the gate already holds", () => {
    const gate = new PassphraseGate();
    gate.request();
    const { api } = inScope(gate);
    expect(api.request.value?.intent).toBe("unlock");
  });

  it("tracks the gate as prompts open and close", async () => {
    const gate = new PassphraseGate();
    const { api } = inScope(gate);
    expect(api.request.value).toBeNull();

    const asked = gate.request();
    expect(api.request.value?.intent).toBe("unlock");

    api.submit("open sesame");
    await expect(asked).resolves.toBe("open sesame");
    expect(api.request.value).toBeNull();
  });

  it("carries the reason a previous attempt was discarded", () => {
    const gate = new PassphraseGate();
    const { api } = inScope(gate);
    gate.forget("That passphrase did not open the wallet.");
    gate.request();
    expect(api.request.value?.previousError).toBe(
      "That passphrase did not open the wallet.",
    );
  });

  it("fails the waiting operation on cancel", async () => {
    const gate = new PassphraseGate();
    const { api } = inScope(gate);
    const asked = gate.request();
    api.cancel();
    await expect(asked).rejects.toThrow();
  });

  // Without the scope cleanup the gate keeps a listener belonging to a
  // component that is gone, and every later prompt writes into a dead ref.
  it("stops listening when the scope is disposed", () => {
    const gate = new PassphraseGate();
    const { api, scope } = inScope(gate);
    scope.stop();
    gate.request();
    expect(api.request.value).toBeNull();
  });
});
