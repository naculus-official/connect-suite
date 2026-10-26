import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("preserves a plain provider message and code", () => {
    expect(
      errorMessage({
        code: -32603,
        message: "in-flight transaction limit reached for delegated accounts",
        data: { requestId: "ignored" },
      }),
    ).toBe(
      "in-flight transaction limit reached for delegated accounts (code -32603)",
    );
  });

  it("preserves Error and string rejection messages", () => {
    expect(errorMessage(new Error("User rejected"))).toBe("User rejected");
    expect(errorMessage("wallet unavailable")).toBe("wallet unavailable");
  });

  it("keeps a provider code attached to an Error", () => {
    expect(
      errorMessage(Object.assign(new Error("denied"), { code: 4001 })),
    ).toBe("denied (code 4001)");
  });

  it("does not stringify opaque objects", () => {
    expect(errorMessage({ data: "private provider detail" })).toBe(
      "Unknown error",
    );
  });
});
