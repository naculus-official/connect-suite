import type { SessionKeyRail, SessionKeyScope } from "@naculus/connect-core";

export type Eip3009SessionKeyRail = Extract<
  SessionKeyRail,
  "x402-exact" | "mpp-charge"
>;

export type SessionKeyRailGrantCheck =
  | { status: "ok"; rail: Eip3009SessionKeyRail }
  | {
      status: "needs-regrant";
      missingRail: Eip3009SessionKeyRail;
    };

const knownRails = new Set<SessionKeyRail>([
  "transfer",
  "x402-exact",
  "mpp-charge",
]);

/**
 * Checks whether a stored session-key scope can sign EIP-3009 for `rail`.
 * Legacy, empty, unknown, and malformed rail lists fail closed and require a
 * new wallet-approved grant.
 */
export function checkSessionKeyRailGrant(
  scope: SessionKeyScope | null | undefined,
  rail: Eip3009SessionKeyRail,
): SessionKeyRailGrantCheck {
  const rails = scope?.rails;
  if (
    !Array.isArray(rails) ||
    rails.length === 0 ||
    new Set(rails).size !== rails.length ||
    !Array.from(rails).every(
      (candidate): candidate is SessionKeyRail =>
        typeof candidate === "string" &&
        knownRails.has(candidate as SessionKeyRail),
    ) ||
    !rails.includes(rail)
  ) {
    return { status: "needs-regrant", missingRail: rail };
  }

  return { status: "ok", rail };
}
