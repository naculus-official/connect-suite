import {
  type Authorization,
  evaluateSpend,
  type ListedAuthorization,
  type SpendRefusal,
  type SpendRequest,
} from "@naculus/connect-core";

export type AssetId = string;

export interface AuthorizationAssetMetadata {
  symbol: string;
  decimals: number;
}

export interface DescribeAuthorizationOptions {
  assets?: Record<AssetId, AuthorizationAssetMetadata>;
  trustedAssets?: readonly string[];
  locale?: string;
  /** Unix timestamp in seconds. */
  now?: number;
  /** Enforcement reported by a successful authorization compile result. */
  enforcement?: "on-chain" | "device";
}

export interface AuthorizationRecipientView {
  shortened: string;
  full: string;
}

export interface AuthorizationAmountView {
  formatted: string;
}

export interface AuthorizationGrantView {
  asset: AssetId;
  assetTrust: "trusted" | "unverified" | "unchecked";
  assetLabel: string;
  recipients: AuthorizationRecipientView[];
  perPayment: AuthorizationAmountView;
  total: AuthorizationAmountView;
  count: number | null;
  period: {
    amount: AuthorizationAmountView;
    every: string;
    startsAt: string;
  } | null;
  rails: string[];
}

export interface AuthorizationExpiryView {
  timestamp: number;
  absolute: string;
  relative: string;
}

export interface AuthorizationDescription {
  label: string | null;
  principal: string | null;
  grants: AuthorizationGrantView[];
  expiry: AuthorizationExpiryView;
  enforcement: "on-chain" | "device" | null;
  enforcementLabel: string | null;
  warnings: string[];
}

// Grouping by hand, not toLocaleString: Hermes (React Native) ignores the
// locale for BigInt and prints "2000000". Linear-time, no regular expression
// over caller-supplied digits.
function groupDigits(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++)
    out += (i && (value.length - i) % 3 === 0 ? "," : "") + value[i];
  return out;
}

/** Metadata for an asset, or none when a trusted list is given and the asset is not on it. */
function trustedMetadata(
  asset: string,
  options: DescribeAuthorizationOptions,
): [AuthorizationGrantView["assetTrust"], AuthorizationAssetMetadata?] {
  const trust = !options.trustedAssets
    ? "unchecked"
    : options.trustedAssets.some(
          (t) => canonicalAssetId(t) === canonicalAssetId(asset),
        )
      ? "trusted"
      : "unverified";
  return [trust, trust === "unverified" ? undefined : options.assets?.[asset]];
}

function canonicalAssetId(asset: string): string {
  return asset.replace(
    /^(eip155:[^/]+\/erc20:)(.+)$/,
    (_, prefix: string, reference: string) => prefix + reference.toLowerCase(),
  );
}

export function formatAuthorizationAmount(
  amount: bigint,
  metadata: AuthorizationAssetMetadata | undefined,
): AuthorizationAmountView {
  const baseUnits = amount.toString();
  if (
    !metadata?.symbol ||
    !Number.isSafeInteger(metadata.decimals) ||
    metadata.decimals < 0 ||
    metadata.decimals > 255 // ERC-20 decimals are a uint8
  ) {
    return {
      formatted: `${groupDigits(baseUnits)} base units`,
    };
  }
  const decimals = metadata.decimals;
  const padded = baseUnits.padStart(decimals + 1, "0");
  const integer = padded.slice(0, decimals ? -decimals : undefined);
  let fraction = decimals ? padded.slice(-decimals) : "";
  while (fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return {
    formatted: `${groupDigits(integer)}${fraction ? `.${fraction}` : ""} ${metadata.symbol}`,
  };
}

function relativeExpiry(
  expiresAt: number,
  now: number,
  locale?: string,
): string {
  const seconds = expiresAt - now;
  const absolute = Math.abs(seconds);
  const [divisor, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute >= 31_536_000
      ? [31_536_000, "year"]
      : absolute >= 2_592_000
        ? [2_592_000, "month"]
        : absolute >= 86_400
          ? [86_400, "day"]
          : absolute >= 3_600
            ? [3_600, "hour"]
            : absolute >= 60
              ? [60, "minute"]
              : [1, "second"];
  const value = Math.round(seconds / divisor);
  // Hermes (React Native) ships no Intl.RelativeTimeFormat; fall back to
  // the English form RelativeTimeFormat produces for "en".
  if (typeof Intl.RelativeTimeFormat !== "function") {
    const count = Math.abs(value);
    const phrase = `${count} ${unit}${count === 1 ? "" : "s"}`;
    return value < 0 || Object.is(value, -0) ? `${phrase} ago` : `in ${phrase}`;
  }
  return new Intl.RelativeTimeFormat(locale).format(value, unit);
}

function absoluteUtc(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(timestamp * 1_000);
}

// The largest unit that divides the period exactly, so 90 seconds stays
// "90 seconds" rather than a rounded "2 minutes". Plain arithmetic and English
// plurals, no Intl: Hermes (React Native) lacks parts of it.
function formatPeriodLength(seconds: number): string {
  const [amount, unit] =
    seconds % 604_800 === 0
      ? [seconds / 604_800, "week"]
      : seconds % 86_400 === 0
        ? [seconds / 86_400, "day"]
        : seconds % 3_600 === 0
          ? [seconds / 3_600, "hour"]
          : seconds % 60 === 0
            ? [seconds / 60, "minute"]
            : [seconds, "second"];
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

function formatAuthorizationEnforcement(
  enforcement: AuthorizationDescription["enforcement"],
): string | null {
  return enforcement === "on-chain"
    ? "Limits enforced by the blockchain"
    : enforcement === "device"
      ? "Limits enforced by this device"
      : null;
}

/** Build a network-free consent/listing view of an authorization. */
export function describeAuthorization(
  input: Authorization | ListedAuthorization,
  options: DescribeAuthorizationOptions = {},
): AuthorizationDescription {
  const now = options.now ?? Math.floor(Date.now() / 1_000);
  const locale = options.locale ?? "en";
  const flags = "flags" in input ? input.flags : [];
  const label = "label" in input ? (input.label ?? null) : null;
  return {
    label,
    principal: input.principal ?? null,
    grants: input.grants.map((grant) => {
      const [assetTrust, metadata] = trustedMetadata(grant.asset, options);
      return {
        asset: grant.asset,
        assetTrust,
        assetLabel: metadata?.symbol || grant.asset.split(":").at(-1)!,
        recipients: grant.recipients.map((full) => ({
          shortened:
            full.length <= 14 ? full : `${full.slice(0, 6)}…${full.slice(-6)}`,
          full,
        })),
        perPayment: formatAuthorizationAmount(grant.maxPerPayment, metadata),
        total: formatAuthorizationAmount(grant.maxTotal, metadata),
        count: grant.maxCount ?? null,
        period: grant.period
          ? {
              amount: formatAuthorizationAmount(grant.period.amount, metadata),
              every: formatPeriodLength(grant.period.seconds),
              startsAt: absoluteUtc(grant.period.start, locale),
            }
          : null,
        rails: grant.rails.map((r) => r.replace("-", " ")),
      };
    }),
    expiry: {
      timestamp: input.expiresAt,
      absolute: absoluteUtc(input.expiresAt, locale),
      relative: relativeExpiry(input.expiresAt, now, locale),
    },
    enforcement: options.enforcement ?? null,
    enforcementLabel: formatAuthorizationEnforcement(
      options.enforcement ?? null,
    ),
    warnings: flags.map((flag) =>
      flag === "unrestricted-recipient-legacy"
        ? "This key can pay any recipient."
        : "This key can do more than shown here.",
    ),
  };
}

const REFUSAL_SENTENCES: Record<SpendRefusal, string> = {
  expired: "This authorization has expired.",
  "not-yet-valid": "This authorization is not valid yet.",
  "no-matching-grant": "No grant covers this asset.",
  "recipient-not-allowed": "This recipient is not allowed.",
  "over-per-payment": "This amount exceeds the per-payment limit.",
  "over-total": "This amount exceeds the remaining total limit.",
  "over-count": "This authorization has reached its payment count limit.",
  "period-limit-exceeded":
    "This amount exceeds the limit for the current period.",
  "rail-not-allowed": "This payment rail is not allowed.",
  "invalid-authorization": "The authorization or spend request is invalid.",
};

export type SpendExplanation =
  | {
      allowed: true;
      grant: number;
      remainingTotal: bigint;
      remainingTotalFormatted: AuthorizationAmountView;
      sentence: string;
    }
  | { allowed: false; reason: SpendRefusal; sentence: string };

/** Explain the shared evaluator's exact allow/refuse result for a UI. */
export function explainSpend(
  authorization: Authorization,
  request: SpendRequest,
  options: DescribeAuthorizationOptions = {},
): SpendExplanation {
  const verdict = evaluateSpend(authorization, request);
  if (!verdict.allow) {
    return {
      allowed: false,
      reason: verdict.reason,
      sentence: REFUSAL_SENTENCES[verdict.reason],
    };
  }
  const remainingTotal =
    authorization.grants[verdict.grant].maxTotal -
    request.spentSoFar -
    request.amount;
  // Same trust rule as describeAuthorization: an unverified asset never gets
  // a caller-supplied symbol, here either.
  const remainingTotalFormatted = formatAuthorizationAmount(
    remainingTotal,
    trustedMetadata(authorization.grants[verdict.grant].asset, options)[1],
  );
  return {
    allowed: true,
    grant: verdict.grant,
    remainingTotal,
    remainingTotalFormatted,
    sentence: `Allowed by grant ${verdict.grant + 1}; ${remainingTotalFormatted.formatted} remain.`,
  };
}
