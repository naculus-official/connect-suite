import type {
  Authorization,
  ListedAuthorization,
  SpendRequest,
} from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import {
  describeAuthorization,
  explainSpend,
  formatAuthorizationAmount,
} from "./authorization";

const ASSET = "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RECIPIENT = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

function authorization(over: Partial<Authorization> = {}): Authorization {
  return {
    version: 1,
    principal: "eip155:8453:0x1111111111111111111111111111111111111111",
    label: "API budget",
    grants: [
      {
        asset: ASSET,
        recipients: [RECIPIENT],
        maxPerPayment: 2_000_000n,
        maxTotal: 10_000_000n,
        maxCount: 3,
        rails: ["x402-exact"],
      },
    ],
    expiresAt: 2_000_000_000,
    ...over,
  };
}

function request(over: Partial<SpendRequest> = {}): SpendRequest {
  return {
    asset: ASSET,
    recipient: RECIPIENT,
    amount: 1_000_000n,
    rail: "x402-exact",
    at: 1_900_000_000,
    spentSoFar: 2_000_000n,
    countSoFar: 1,
    ...over,
  };
}

describe("describeAuthorization", () => {
  it("classifies trusted assets canonically and hides unverified metadata", () => {
    const metadata = { [ASSET]: { symbol: "USDC", decimals: 6 } };
    const unchecked = describeAuthorization(authorization(), {
      assets: metadata,
    });
    expect(unchecked.grants[0]).toMatchObject({
      assetTrust: "unchecked",
      assetLabel: "USDC",
      perPayment: { formatted: "2 USDC" },
    });

    const trusted = describeAuthorization(authorization(), {
      assets: metadata,
      trustedAssets: [ASSET.toLowerCase()],
    });
    expect(trusted.grants[0]).toMatchObject({
      assetTrust: "trusted",
      assetLabel: "USDC",
      perPayment: { formatted: "2 USDC" },
    });

    const unverified = describeAuthorization(authorization(), {
      assets: metadata,
      trustedAssets: [],
    });
    expect(unverified.grants[0]).toMatchObject({
      assetTrust: "unverified",
      assetLabel: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      perPayment: { formatted: "2,000,000 base units" },
      total: { formatted: "10,000,000 base units" },
    });
    expect(JSON.stringify(unverified)).not.toContain("USDC");
  });

  it("keeps Solana asset references case-sensitive", () => {
    const asset =
      "solana:mainnet/slip44:So11111111111111111111111111111111111111112";
    const grant = { ...authorization().grants[0], asset };
    const view = describeAuthorization(authorization({ grants: [grant] }), {
      trustedAssets: [asset.replace("So111", "so111")],
    });
    expect(view.grants[0].assetTrust).toBe("unverified");
  });

  it("formats known metadata and never guesses unknown asset metadata", () => {
    const known = describeAuthorization(authorization(), {
      assets: { [ASSET]: { symbol: "USDC", decimals: 6 } },
      locale: "en-US",
      now: 1_999_913_600,
    });
    expect(known.grants[0]).toMatchObject({
      assetLabel: "USDC",
      perPayment: { formatted: "2 USDC" },
      total: { formatted: "10 USDC" },
      count: 3,
      rails: ["x402 exact"],
      recipients: [{ shortened: "0x2096…12287C", full: RECIPIENT }],
    });
    expect(known.expiry.relative).toBe("in 1 day");
    expect(known.expiry.absolute).toBe("May 18, 2033, 03:33 UTC");
    expect(known.expiry.timestamp).toBe(2_000_000_000);

    const unknown = describeAuthorization(authorization(), {
      now: 2_000_000_001,
    });
    expect(unknown.grants[0]).toMatchObject({
      assetLabel: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      perPayment: { formatted: "2,000,000 base units" },
    });
    expect(unknown.expiry.relative).toBe("1 second ago");
    expect(unknown.expiry.absolute).toBe("May 18, 2033, 03:33 UTC");
  });

  it.each([
    [1, "1 second"],
    [59, "59 seconds"],
    [60, "1 minute"],
    [90, "90 seconds"],
    [1_800, "30 minutes"],
    [3_600, "1 hour"],
    [5_400, "90 minutes"],
    [86_400, "1 day"],
    [604_800, "1 week"],
    [2_592_000, "30 days"],
  ])("formats a %i second grant period", (seconds, every) => {
    const grant = {
      ...authorization().grants[0],
      period: { amount: 3_000_000n, seconds, start: 1_900_000_000 },
    };
    const view = describeAuthorization(authorization({ grants: [grant] }), {
      assets: { [ASSET]: { symbol: "USDC", decimals: 6 } },
      enforcement: "on-chain",
    });
    expect(view.grants[0].period).toEqual({
      amount: { formatted: "3 USDC" },
      every,
      startsAt: "Mar 17, 2030, 17:46 UTC",
    });
    expect(view.enforcement).toBe("on-chain");
  });

  it("formats an unverified period amount in base units", () => {
    const grant = {
      ...authorization().grants[0],
      period: { amount: 3_000_000n, seconds: 86_400, start: 1_900_000_000 },
    };
    const view = describeAuthorization(authorization({ grants: [grant] }), {
      assets: { [ASSET]: { symbol: "USDC", decimals: 6 } },
      trustedAssets: [],
    });
    expect(view.grants[0].period?.amount.formatted).toBe(
      "3,000,000 base units",
    );
    expect(view.enforcement).toBeNull();
  });

  it("uses English by default and honors an explicit locale", () => {
    const defaults = describeAuthorization(authorization(), {
      now: 1_999_913_600,
    });
    expect(defaults.expiry).toMatchObject({
      absolute: "May 18, 2033, 03:33 UTC",
      relative: "in 1 day",
    });
    const german = describeAuthorization(authorization(), {
      locale: "de-DE",
      now: 1_999_913_600,
    });
    expect(german.expiry.absolute).toBe("18. Mai 2033, 03:33 UTC");
    expect(german.expiry.relative).toBe("in 1 Tag");
  });

  it("formats relative expiry without Intl.RelativeTimeFormat (Hermes)", () => {
    const offsets = [-7_200, -1, 0, 1, 90, 86_400, 172_800, 62_208_000];
    const describe = (offset: number) =>
      describeAuthorization(
        authorization({ expiresAt: 2_000_000_000 + offset }),
        { now: 2_000_000_000 },
      ).expiry.relative;
    const expected = offsets.map(describe);
    const original = Intl.RelativeTimeFormat;
    // Hermes on Android has no RelativeTimeFormat; `new undefined` crashed.
    Reflect.deleteProperty(Intl, "RelativeTimeFormat");
    try {
      expect(offsets.map(describe)).toEqual(expected);
    } finally {
      Object.defineProperty(Intl, "RelativeTimeFormat", {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });

  it.each([
    [90, "in 2 minutes"],
    [7_200, "in 2 hours"],
    [172_800, "in 2 days"],
    [-7_200, "2 hours ago"],
    [31_536_000, "in 1 year"],
    [62_208_000, "in 2 years"],
  ])("formats a %i second offset with a useful unit", (offset, expected) => {
    expect(
      describeAuthorization(
        authorization({ expiresAt: 2_000_000_000 + offset }),
        { locale: "en", now: 2_000_000_000 },
      ).expiry.relative,
    ).toBe(expected);
  });

  it("turns every listing flag into its required warning", () => {
    const listed = {
      ...authorization(),
      keyId: "key-1",
      status: "active",
      enforcer: "evm-session",
      flags: ["unrestricted-recipient-legacy", "not-expressible"],
      raw: {},
    } as unknown as ListedAuthorization;
    expect(
      describeAuthorization(listed, { now: 1_900_000_000 }).warnings,
    ).toEqual([
      "This key can pay any recipient.",
      "This key can do more than shown here.",
    ]);
  });

  it("formats very long amounts in linear time", () => {
    const amount = 10n ** 5000n;
    const started = performance.now();
    const view = formatAuthorizationAmount(amount, {
      symbol: "X",
      decimals: 255,
    });
    expect(performance.now() - started).toBeLessThan(200);
    expect(view.formatted.endsWith(" X")).toBe(true);
  });

  it.each([
    [0n, { symbol: "USDC", decimals: 6 }, "0 USDC"],
    [999_000_000n, { symbol: "USDC", decimals: 6 }, "999 USDC"],
    [1_000_000_000n, { symbol: "USDC", decimals: 6 }, "1,000 USDC"],
    [1_234_567_890_000n, { symbol: "USDC", decimals: 6 }, "1,234,567.89 USDC"],
    [
      12_345_678_901_234_567_890n,
      { symbol: "ETH", decimals: 18 },
      "12.34567890123456789 ETH",
    ],
    [1_234_567n, undefined, "1,234,567 base units"],
    [1_000_000n, { symbol: "BIG", decimals: 256 }, "1,000,000 base units"],
    [100n, { symbol: "ONE", decimals: 2 }, "1 ONE"],
    [1_000n, { symbol: "K", decimals: 0 }, "1,000 K"],
  ] as const)(
    "formats %s without floating point",
    (amount, metadata, expected) => {
      expect(formatAuthorizationAmount(amount, metadata).formatted).toBe(
        expected,
      );
    },
  );
});

describe("formatAuthorizationAmount on Hermes", () => {
  it("groups digits without relying on BigInt.prototype.toLocaleString", () => {
    // Hermes (React Native) ignores the locale for BigInt: "2000000".
    const original = BigInt.prototype.toLocaleString;
    BigInt.prototype.toLocaleString = function (this: bigint) {
      return this.toString();
    };
    try {
      expect(formatAuthorizationAmount(2_000_000n, undefined).formatted).toBe(
        "2,000,000 base units",
      );
      expect(
        formatAuthorizationAmount(1_234_567_890_000_000n, {
          symbol: "USDC",
          decimals: 6,
        }).formatted,
      ).toBe("1,234,567,890 USDC");
    } finally {
      BigInt.prototype.toLocaleString = original;
    }
  });
});

describe("explainSpend with trusted assets", () => {
  it("never shows a caller-supplied symbol for an unverified asset", () => {
    const hostile = { [ASSET]: { symbol: "USDC", decimals: 6 } };
    const unverified = explainSpend(authorization(), request(), {
      assets: hostile,
      trustedAssets: [],
    });
    expect(unverified.sentence).not.toContain("USDC");
    expect(unverified.sentence).toContain("base units");
    const trusted = explainSpend(authorization(), request(), {
      assets: hostile,
      trustedAssets: [ASSET],
    });
    expect(trusted.sentence).toContain("USDC");
  });
});

describe("explainSpend", () => {
  it.each([
    [
      "expired",
      authorization(),
      request({ at: 2_000_000_000 }),
      "This authorization has expired.",
    ],
    [
      "not-yet-valid",
      authorization({ notBefore: 1_950_000_000 }),
      request(),
      "This authorization is not valid yet.",
    ],
    [
      "no-matching-grant",
      authorization(),
      request({
        asset: "eip155:8453/erc20:0x1111111111111111111111111111111111111111",
      }),
      "No grant covers this asset.",
    ],
    [
      "recipient-not-allowed",
      authorization(),
      request({ recipient: "0x2222222222222222222222222222222222222222" }),
      "This recipient is not allowed.",
    ],
    [
      "over-per-payment",
      authorization(),
      request({ amount: 2_000_001n }),
      "This amount exceeds the per-payment limit.",
    ],
    [
      "over-total",
      authorization(),
      request({ amount: 2_000_000n, spentSoFar: 9_000_000n }),
      "This amount exceeds the remaining total limit.",
    ],
    [
      "over-count",
      authorization(),
      request({ countSoFar: 3 }),
      "This authorization has reached its payment count limit.",
    ],
    [
      "period-limit-exceeded",
      authorization({
        grants: [
          {
            ...authorization().grants[0],
            period: {
              amount: 2_000_000n,
              seconds: 86_400,
              start: 1_800_000_000,
            },
          },
        ],
      }),
      request({ amount: 1_000_000n, periodSpentSoFar: 1_500_000n }),
      "This amount exceeds the limit for the current period.",
    ],
    [
      "rail-not-allowed",
      authorization(),
      request({ rail: "transfer" }),
      "This payment rail is not allowed.",
    ],
    [
      "invalid-authorization",
      authorization(),
      request({ amount: 0n }),
      "The authorization or spend request is invalid.",
    ],
  ] as const)(
    "maps %s to a stable sentence",
    (reason, auth, spend, sentence) => {
      expect(explainSpend(auth, spend)).toEqual({
        allowed: false,
        reason,
        sentence,
      });
    },
  );

  it("reports the matching grant and remaining total", () => {
    expect(explainSpend(authorization(), request())).toEqual({
      allowed: true,
      grant: 0,
      remainingTotal: 7_000_000n,
      remainingTotalFormatted: {
        formatted: "7,000,000 base units",
      },
      sentence: "Allowed by grant 1; 7,000,000 base units remain.",
    });
  });
});
