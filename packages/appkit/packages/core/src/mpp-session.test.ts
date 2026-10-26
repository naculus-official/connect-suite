import { describe, expect, it } from "vitest";
import {
  readMppRecoveryChannelId,
  readCurrentMppSessionChannel,
  readMppSessionChannel,
  readMppSessionReceipt,
} from "./mpp-session";

const channel = {
  channelId: "channel-1",
  payer: "payer",
  payee: "payee",
  mint: "mint",
  channelProgram: "program",
  deposit: 100n,
  gracePeriodSeconds: 3600,
  openSlot: 9n,
  salt: 7n,
};

describe("MPP session shape readers", () => {
  it("accepts complete channels and successful receipts", () => {
    expect(readMppSessionChannel(channel)).toBe(channel);
    const receipt = {
      status: "success",
      method: "solana",
      timestamp: "2026-09-30T00:00:00Z",
      reference: "tx-1",
      channelId: "channel-1",
    };
    expect(readMppSessionReceipt(receipt)).toBe(receipt);
  });

  it("rejects malformed channels and receipts", () => {
    expect(readMppSessionChannel({ ...channel, deposit: "100" })).toBeNull();
    expect(readMppSessionReceipt({ status: "success" })).toBeNull();
  });

  it("reads the last valid channel held by a session", () => {
    expect(
      readCurrentMppSessionChannel({
        channels: [channel, { ...channel, deposit: "invalid" }],
      }),
    ).toBe(channel);
    expect(readCurrentMppSessionChannel({ channels: [] })).toBeNull();
  });

  it("reads only non-empty recovery channel ids", () => {
    expect(readMppRecoveryChannelId({ channelId: "channel-1" })).toBe(
      "channel-1",
    );
    expect(readMppRecoveryChannelId({ channelId: "" })).toBeNull();
    expect(readMppRecoveryChannelId(new Error("failed"))).toBeNull();
  });
});
