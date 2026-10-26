import type { SessionKeyScope } from "@naculus/connect-core";
import { describe, expect, it } from "vitest";
import { checkSessionKeyRailGrant } from "./session-key-rail";

const scope = (rails?: SessionKeyScope["rails"]): SessionKeyScope => ({
  expiry: 2_000_000_000,
  mode: "offchain",
  rails,
} as SessionKeyScope);

describe("checkSessionKeyRailGrant", () => {
  it.each([
    ["missing rails", scope(), "x402-exact"],
    ["empty rails", scope([]), "x402-exact"],
    ["only transfer", scope(["transfer"]), "x402-exact"],
    ["other EIP-3009 rail", scope(["mpp-charge"]), "x402-exact"],
  ] as const)("requires a re-grant for %s", (_name, scope, rail) => {
    expect(checkSessionKeyRailGrant(scope, rail)).toEqual({
      status: "needs-regrant",
      missingRail: rail,
    });
  });

  it.each(["x402-exact", "mpp-charge"] as const)(
    "accepts a scope that grants %s",
    (rail) => {
      expect(checkSessionKeyRailGrant(scope([rail]), rail)).toEqual({
        status: "ok",
        rail,
      });
    },
  );

  it("fails closed for a malformed scope", () => {
    expect(
      checkSessionKeyRailGrant(
        { rails: ["x402-exact", "unknown-rail"] } as unknown as SessionKeyScope,
        "x402-exact",
      ),
    ).toEqual({ status: "needs-regrant", missingRail: "x402-exact" });
  });

  it("fails closed when rails contain a duplicate", () => {
    expect(checkSessionKeyRailGrant(scope(["x402-exact", "x402-exact"]), "x402-exact")).toEqual({
      status: "needs-regrant",
      missingRail: "x402-exact",
    });
  });

  it("fails closed for a sparse rails array", () => {
    const rails = ["x402-exact"] as SessionKeyScope["rails"] & unknown[];
    rails.length = 2;
    expect(checkSessionKeyRailGrant(scope(rails), "x402-exact")).toEqual({
      status: "needs-regrant",
      missingRail: "x402-exact",
    });
  });
});
