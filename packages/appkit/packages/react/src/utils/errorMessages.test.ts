import { describe, expect, it } from "vitest";
import {
  getUserFriendlyError,
  isRetryableError,
  UNKNOWN_ERROR_DESCRIPTION,
  UNKNOWN_ERROR_TITLE,
} from "./errorMessages";

/**
 * This module turns failures into the sentence a user reads, and it sat at
 * 12.9% coverage. Two things it got wrong: isRetryableError crashed on a null
 * error — so the error handler failed while handling an error and buried the
 * original — and the generic /chain/ pattern was tested before the specific
 * "insufficient funds" one, so a balance problem was reported as a network
 * problem and sent the user to check their connection.
 */

const walletError = (code: string, message = "boom") => ({
  name: "WalletError",
  code,
  message,
});

describe("getUserFriendlyError — WalletError codes", () => {
  it("maps a known code to its title and description", () => {
    const r = getUserFriendlyError(walletError("user_rejected"));
    expect(r.code).toBe("user_rejected");
    expect(r.title).not.toBe(UNKNOWN_ERROR_TITLE);
  });

  it("falls back to the raw message for an unknown code", () => {
    const r = getUserFriendlyError(walletError("some_new_code", "raw detail"));
    expect(r.title).toBe(UNKNOWN_ERROR_TITLE);
    expect(r.description).toBe("raw detail");
    expect(r.code).toBe("some_new_code");
  });
});

describe("getUserFriendlyError — message patterns", () => {
  it("classifies a rejection", () => {
    expect(
      getUserFriendlyError(new Error("User rejected the request")).code,
    ).toBe("user_rejected");
  });

  it("classifies a timeout", () => {
    expect(getUserFriendlyError(new Error("Request timed out")).code).toBe(
      "deeplink_timeout",
    );
  });

  it("classifies a network failure", () => {
    expect(getUserFriendlyError(new Error("network unreachable")).code).toBe(
      "chain_unsupported",
    );
  });

  it("classifies insufficient funds", () => {
    expect(getUserFriendlyError(new Error("insufficient funds")).code).toBe(
      "tx_failed",
    );
  });

  it("prefers the funds reading when the message also mentions a chain", () => {
    // Telling someone to check their network when they are simply out of
    // funds costs them the actual answer.
    const r = getUserFriendlyError(
      new Error("insufficient funds for gas on chain 1"),
    );
    expect(r.code).toBe("tx_failed");
    expect(r.title).toBe("Insufficient Funds");
  });
});

describe("getUserFriendlyError — EIP-1193 code 4001", () => {
  it("maps a numeric 4001 on the error to user_rejected", () => {
    const err = Object.assign(new Error("Something odd"), { code: 4001 });
    const r = getUserFriendlyError(err);
    expect(r.code).toBe("user_rejected");
    expect(r.title).toBe("Request Rejected");
    expect(r.description).toBe("The request was declined.");
  });

  it("maps a 4001 on a plain object without an Error instance", () => {
    expect(getUserFriendlyError({ code: 4001, message: "x" }).code).toBe(
      "user_rejected",
    );
  });

  it("maps a 4001 wrapped in data.originalError", () => {
    const err = { code: -32603, data: { originalError: { code: 4001 } } };
    expect(getUserFriendlyError(err).code).toBe("user_rejected");
  });

  it("maps a 4001 on the cause", () => {
    const err = new Error("wrapped", { cause: { code: 4001 } });
    expect(getUserFriendlyError(err).code).toBe("user_rejected");
  });

  it("does not map other numeric codes to user_rejected", () => {
    expect(
      getUserFriendlyError({ code: -32603, message: "internal" }).code,
    ).toBeUndefined();
  });
});

describe("getUserFriendlyError — non-Error inputs", () => {
  it.each([null, undefined])("handles %p", (input) => {
    const r = getUserFriendlyError(input);
    expect(r.title).toBe(UNKNOWN_ERROR_TITLE);
    expect(r.description).toBe(UNKNOWN_ERROR_DESCRIPTION);
  });

  it("uses a string error as the description", () => {
    expect(getUserFriendlyError("plain failure").description).toBe(
      "plain failure",
    );
  });

  it("does not present an empty message as the description", () => {
    expect(getUserFriendlyError(new Error("")).description).toBe(
      UNKNOWN_ERROR_DESCRIPTION,
    );
  });

  it("handles an object that is not an Error", () => {
    expect(getUserFriendlyError({ weird: true }).title).toBe(
      UNKNOWN_ERROR_TITLE,
    );
  });
});

describe("isRetryableError", () => {
  it.each([
    "deeplink_timeout",
    "session_expired",
    "intent_expired",
    "tx_failed",
  ])("reports %s as retryable", (code) => {
    expect(isRetryableError(walletError(code))).toBe(true);
  });

  it("reports a permanent failure as not retryable", () => {
    expect(isRetryableError(walletError("user_rejected"))).toBe(false);
  });

  it("returns false for a non-WalletError", () => {
    expect(isRetryableError(new Error("boom"))).toBe(false);
  });

  it.each([null, undefined, "string", 42, true])(
    "returns false instead of throwing on %p",
    (input) => {
      // Promise.reject() with no reason lands here.
      expect(() => isRetryableError(input)).not.toThrow();
      expect(isRetryableError(input)).toBe(false);
    },
  );
});
