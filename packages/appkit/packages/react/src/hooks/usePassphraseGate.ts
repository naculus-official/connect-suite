import { useCallback, useSyncExternalStore } from "react";
import type {
  PassphraseGate,
  PassphraseRequest,
} from "@naculus/connect-core";
import { useWeb3 } from "../provider/Web3ConnectProvider";
import { resolveClient } from "./client-resolver";

export interface UsePassphraseGateReturn {
  /**
   * The open request, or null when nothing is being asked.
   *
   * Also null when no gate exists — an app that supplies its own
   * `encryptionPassphrase`, or one with encryption off entirely. A dialog can
   * render against this unconditionally.
   */
  request: PassphraseRequest | null;
  /** Answer the open request. */
  submit: (passphrase: string) => void;
  /** Abandon it, failing the load or save that asked. */
  cancel: () => void;
  /** Drop the held passphrase, so the next operation asks again. */
  forget: (reason?: string) => void;
  /** Whether a passphrase is held for this session. */
  isUnlocked: boolean;
  gate: PassphraseGate | null;
}

const NO_REQUEST = () => null;
const NEVER = () => () => {};

/**
 * Drives the passphrase prompt for the embedded wallet's encrypted storage.
 *
 * The gate belongs to the client, so a dialog mounted anywhere under the
 * provider answers whichever load or save is currently blocked on it.
 */
export function usePassphraseGate(): UsePassphraseGateReturn {
  const { client } = useWeb3();
  const gate = resolveClient(client)?.passphraseGate ?? null;

  const request = useSyncExternalStore(
    gate?.subscribe ?? NEVER,
    gate?.getSnapshot ?? NO_REQUEST,
    // Server renders have no gate state. Returning null rather than reading
    // the live one keeps hydration from flashing a dialog the server never
    // rendered.
    NO_REQUEST,
  );

  const submit = useCallback(
    (passphrase: string) => gate?.submit(passphrase),
    [gate],
  );
  const cancel = useCallback(() => gate?.cancel(), [gate]);
  const forget = useCallback((reason?: string) => gate?.forget(reason), [gate]);

  return {
    request,
    submit,
    cancel,
    forget,
    isUnlocked: gate?.isUnlocked ?? false,
    gate,
  };
}
