import type { PassphraseGate, PassphraseRequest } from "@naculus/connect-core";
import { onScopeDispose, readonly, shallowRef } from "vue";

export interface UsePassphraseGateReturn {
  /** The open request, or null when nothing is being asked. */
  request: Readonly<ReturnType<typeof shallowRef<PassphraseRequest | null>>>;
  /** Answer the open request. */
  submit: (passphrase: string) => void;
  /** Abandon it, failing the load or save that asked. */
  cancel: (reason?: string) => void;
  /** Drop the held passphrase, so the next operation asks again. */
  forget: (reason?: string) => void;
}

/**
 * Bind a `PassphraseGate` into Vue reactivity.
 *
 * The gate itself lives in `@naculus/connect-core` rather than in either
 * framework package, because the thing it bridges — an encrypted storage
 * adapter asking for a passphrase from inside code that has never heard of a
 * component — is the same problem in React and in Vue. One implementation,
 * two thin bindings.
 *
 * ```ts
 * const gate = new PassphraseGate()
 * const wallet = new PocketWallet({ encryptionPassphrase: gate.request })
 * const { request, submit, cancel } = usePassphraseGate(gate)
 * ```
 *
 * `shallowRef`, not `ref`: the request is a small immutable snapshot the gate
 * replaces wholesale, and deep reactivity over it would proxy an object that
 * never mutates in place.
 */
export function usePassphraseGate(
  gate: PassphraseGate,
): UsePassphraseGateReturn {
  const request = shallowRef<PassphraseRequest | null>(gate.getSnapshot());
  const unsubscribe = gate.subscribe(() => {
    request.value = gate.getSnapshot();
  });
  // Without this the gate keeps a reference to a listener belonging to a
  // component that is gone, and every later prompt writes into a dead ref.
  onScopeDispose(unsubscribe);

  return {
    request: readonly(request) as UsePassphraseGateReturn["request"],
    submit: (passphrase: string) => gate.submit(passphrase),
    cancel: (reason?: string) => gate.cancel(reason),
    forget: (reason?: string) => gate.forget(reason),
  };
}
