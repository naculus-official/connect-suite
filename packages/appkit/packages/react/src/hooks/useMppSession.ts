import {
  type MppSessionChannel,
  type MppSessionFetch,
  type MppSessionFetchResult,
  type MppSessionForceCloseResult,
  type MppSessionReceipt,
  type MppSessionRequest,
  readCurrentMppSessionChannel,
  readMppRecoveryChannelId,
  readMppSessionReceipt,
} from "@naculus/connect-appkit-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseMppSessionReturn {
  fetch: MppSessionRequest;
  meter: { add(units: bigint): void };
  pending: bigint;
  channel: MppSessionChannel | null;
  lastReceipt: MppSessionReceipt | null;
  recoveryChannelId: string | null;
  isPending: boolean;
  error: Error | null;
  close(): Promise<MppSessionFetchResult>;
  forceClose(): Promise<MppSessionForceCloseResult>;
  reset(): void;
}

function normalizeError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error("MPP session operation failed");
}

/** Reactive state around an MPP session fetch built and owned by the app. */
export function useMppSession(session: MppSessionFetch): UseMppSessionReturn {
  const [inFlight, setInFlight] = useState(0);
  const [pending, setPending] = useState(() => session.meter.pending);
  const [channel, setChannel] = useState<MppSessionChannel | null>(() =>
    readCurrentMppSessionChannel(session),
  );
  const [lastReceipt, setLastReceipt] = useState<MppSessionReceipt | null>(
    null,
  );
  const [recoveryChannelId, setRecoveryChannelId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);
  const generationRef = useRef(0);
  const epochRef = useRef(0);
  const mountedRef = useRef(true);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    generationRef.current += 1;
    epochRef.current += 1;
    setInFlight(0);
    setPending(session.meter.pending);
    setChannel(readCurrentMppSessionChannel(session));
    setLastReceipt(null);
    setRecoveryChannelId(null);
    setError(null);
  }, [session]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      generationRef.current += 1;
      epochRef.current += 1;
    },
    [],
  );

  const run = useCallback(
    async <T>(
      operation: (current: MppSessionFetch) => Promise<T>,
      publish?: (value: T) => void,
      clearsRecovery = false,
    ): Promise<T> => {
      const own = ++generationRef.current;
      const epoch = epochRef.current;
      const invokedSession = sessionRef.current;
      setInFlight((count) => count + 1);
      setError(null);
      try {
        const result = await operation(invokedSession);
        if (mountedRef.current && epoch === epochRef.current) {
          publish?.(result);
          const currentChannel = readCurrentMppSessionChannel(invokedSession);
          setChannel(currentChannel);
          setPending(invokedSession.meter.pending);
          if (clearsRecovery || !currentChannel) setRecoveryChannelId(null);
        }
        return result;
      } catch (cause) {
        const normalized = normalizeError(cause);
        if (mountedRef.current && epoch === epochRef.current) {
          const currentChannel = readCurrentMppSessionChannel(invokedSession);
          setChannel(currentChannel);
          setPending(invokedSession.meter.pending);
          const recovery = readMppRecoveryChannelId(cause);
          if (recovery) setRecoveryChannelId(recovery);
          else if (!currentChannel) setRecoveryChannelId(null);
          if (own === generationRef.current) setError(normalized);
        }
        throw normalized;
      } finally {
        if (mountedRef.current && epoch === epochRef.current) {
          setInFlight((count) => count - 1);
        }
      }
    },
    [],
  );

  const fetch = useCallback<MppSessionRequest>(
    (input, init) =>
      run(
        (current) => current(input, init),
        (result) => {
          const receipt = readMppSessionReceipt(result.receipt);
          if (receipt) setLastReceipt(receipt);
        },
      ),
    [run],
  );

  const close = useCallback(
    () =>
      run(
        (current) => current.close(),
        (result) => {
          const receipt = readMppSessionReceipt(result.receipt);
          if (receipt) setLastReceipt(receipt);
        },
        true,
      ),
    [run],
  );

  const forceClose = useCallback(
    () => run((current) => current.forceClose(), undefined, true),
    [run],
  );

  const add = useCallback((units: bigint) => {
    try {
      sessionRef.current.meter.add(units);
      setPending(sessionRef.current.meter.pending);
      setError(null);
    } catch (cause) {
      const normalized = normalizeError(cause);
      setError(normalized);
      setRecoveryChannelId(readMppRecoveryChannelId(cause));
      throw normalized;
    }
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    epochRef.current += 1;
    // Calls from the old epoch no longer decrement the counter.
    setInFlight(0);
    setPending(sessionRef.current.meter.pending);
    setChannel(readCurrentMppSessionChannel(sessionRef.current));
    setLastReceipt(null);
    setRecoveryChannelId(null);
    setError(null);
  }, []);

  const meter = useMemo(() => ({ add }), [add]);

  return {
    fetch,
    meter,
    pending,
    channel,
    lastReceipt,
    recoveryChannelId,
    isPending: inFlight > 0,
    error,
    close,
    forceClose,
    reset,
  };
}
