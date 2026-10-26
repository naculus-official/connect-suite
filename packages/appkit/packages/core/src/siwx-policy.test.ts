import { describe, expect, it, vi } from "vitest";
import {
  defaultSiwxDomain,
  defaultSiwxUri,
  isSiwxExpired,
  isSiwxNotBeforeValid,
  siwxResultToSession,
} from "./siwx-policy";

const result = {
  message: {
    chainId: "eip155:1",
    address: "0xabc",
    domain: "example.com",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expirationTime: "2026-01-02T00:00:00.000Z",
    notBefore: "2025-12-31T00:00:00.000Z",
  },
  signature: "0xsig",
};

describe("SIWX policy", () => {
  it("uses browser location when supplied and SSR defaults otherwise", () => {
    expect(defaultSiwxDomain()).toBe("localhost");
    expect(defaultSiwxUri()).toBe("http://localhost");
    const location = {
      host: "example.com:3000",
      origin: "https://example.com:3000",
    };
    expect(defaultSiwxDomain(location)).toBe(location.host);
    expect(defaultSiwxUri(location)).toBe(location.origin);
  });

  it("applies expiration and not-before boundaries inclusively", () => {
    const boundary = new Date("2026-01-02T00:00:00.000Z");
    expect(isSiwxExpired(result, boundary)).toBe(true);
    expect(isSiwxNotBeforeValid(result, boundary)).toBe(true);
    expect(
      isSiwxNotBeforeValid(
        {
          ...result,
          message: { ...result.message, notBefore: "2026-01-03T00:00:00.000Z" },
        },
        boundary,
      ),
    ).toBe(false);
  });

  it("fails closed for malformed temporal claims", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(
      isSiwxExpired(
        {
          ...result,
          message: { ...result.message, expirationTime: "garbage" },
        },
        now,
      ),
    ).toBe(true);
    expect(
      isSiwxNotBeforeValid(
        { ...result, message: { ...result.message, notBefore: "garbage" } },
        now,
      ),
    ).toBe(false);
  });

  it("keeps absent temporal claims valid", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    const withoutTimes = {
      ...result,
      message: {
        ...result.message,
        expirationTime: null,
        notBefore: null,
      },
    };
    expect(isSiwxExpired(withoutTimes, now)).toBe(false);
    expect(isSiwxNotBeforeValid(withoutTimes, now)).toBe(true);
  });

  it("maps a result without changing signed fields", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint8Array).fill(1);
      return array;
    });
    const session = siwxResultToSession(
      result,
      new Date("2026-01-01T12:00:00.000Z"),
    );
    expect(session).toMatchObject({
      chainId: result.message.chainId,
      address: result.message.address,
      domain: result.message.domain,
      message: result.message,
      signature: result.signature,
      issuedAt: result.message.issuedAt,
      expiresAt: result.message.expirationTime,
      refreshedAt: null,
    });
    expect(session.id).toMatch(/^siwx_[a-z0-9]+_0101010101010101$/);
  });
});
