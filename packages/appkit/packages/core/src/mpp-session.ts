/** Request options accepted by a caller-built MPP session fetch. */
export interface MppSessionRequestInit extends RequestInit {
  units?: bigint;
}

/** An open MPP payment channel, represented without depending on payments-mpp. */
export interface MppSessionChannel {
  channelId: string;
  payer: string;
  payee: string;
  mint: string;
  channelProgram: string;
  deposit: bigint;
  gracePeriodSeconds: number;
  openSlot: bigint;
  salt: bigint;
}

/** A successful MPP receipt, represented structurally. */
export interface MppSessionReceipt {
  status: "success";
  method: string;
  timestamp: string;
  reference: string;
  [field: string]: unknown;
}

export interface MppSessionFetchResult {
  response: Response;
  receipt: unknown;
  channel: unknown;
}

export type MppSessionRequest = (
  input: RequestInfo | URL,
  init?: MppSessionRequestInit,
) => Promise<MppSessionFetchResult>;

export interface MppSessionForceCloseResult {
  requestCloseTxHash: string;
  withdrawPayer(): Promise<string>;
}

export interface MppSessionMeter {
  add(units: bigint): void;
  readonly pending: bigint;
}

/** The caller-owned session surface consumed by the React and Vue shells. */
export interface MppSessionFetch extends MppSessionRequest {
  readonly meter: MppSessionMeter;
  readonly channels: readonly unknown[];
  close(): Promise<MppSessionFetchResult>;
  forceClose(): Promise<MppSessionForceCloseResult>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Return a channel only when all public fields have the expected shape. */
export function readMppSessionChannel(
  value: unknown,
): MppSessionChannel | null {
  const channel = record(value);
  if (
    !channel ||
    typeof channel.channelId !== "string" ||
    typeof channel.payer !== "string" ||
    typeof channel.payee !== "string" ||
    typeof channel.mint !== "string" ||
    typeof channel.channelProgram !== "string" ||
    typeof channel.deposit !== "bigint" ||
    typeof channel.gracePeriodSeconds !== "number" ||
    typeof channel.openSlot !== "bigint" ||
    typeof channel.salt !== "bigint"
  ) {
    return null;
  }
  return channel as unknown as MppSessionChannel;
}

/** Return the newest structurally valid channel currently held by a session. */
export function readCurrentMppSessionChannel(
  session: Pick<MppSessionFetch, "channels">,
): MppSessionChannel | null {
  for (let index = session.channels.length - 1; index >= 0; index--) {
    const channel = readMppSessionChannel(session.channels[index]);
    if (channel) return channel;
  }
  return null;
}

/** Return a receipt only when it has the public success-receipt shape. */
export function readMppSessionReceipt(
  value: unknown,
): MppSessionReceipt | null {
  const receipt = record(value);
  if (
    receipt?.status !== "success" ||
    typeof receipt.method !== "string" ||
    typeof receipt.timestamp !== "string" ||
    typeof receipt.reference !== "string"
  ) {
    return null;
  }
  return receipt as MppSessionReceipt;
}

/** A post-send channel-open failure carries the channel that can be recovered. */
export function readMppRecoveryChannelId(error: unknown): string | null {
  const channelId = record(error)?.channelId;
  return typeof channelId === "string" && channelId !== "" ? channelId : null;
}
