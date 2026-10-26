import { describe, expect, it } from "vitest";
import { bareEvmAddress, validateDestination } from "./destination";

describe("validateDestination", () => {
  it("accepts well-formed addresses, regardless of case", () => {
    expect(
      validateDestination("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toEqual({
      isValid: true,
      level: "ok",
      issue: null,
    });
    expect(
      validateDestination("0xABCDEF1234567890ABCDEF1234567890ABCDEF12").isValid,
    ).toBe(true);
  });

  it("blocks empty, malformed, zero and burn destinations with a reason", () => {
    expect(validateDestination("").issue).toBe("empty");
    expect(validateDestination("0x123").issue).toBe("invalid_format");
    expect(validateDestination("not-an-address").issue).toBe("invalid_format");
    expect(
      validateDestination("0x0000000000000000000000000000000000000000").issue,
    ).toBe("zero_address");
    expect(
      validateDestination("0x000000000000000000000000000000000000dead").issue,
    ).toBe("burn_address");
    expect(
      validateDestination("0x000000000000000000000000000000000000dEaD").issue,
    ).toBe("burn_address");
    expect(
      validateDestination("0x0000000000000000000000000000000000000001").issue,
    ).toBe("burn_address");
    expect(
      validateDestination("0x00dead000000000000000000000000000000abcd").issue,
    ).toBe("burn_address");
    for (const bad of [
      "",
      "0x123",
      "0x0000000000000000000000000000000000000000",
    ]) {
      expect(validateDestination(bad).level).toBe("blocked");
    }
  });
});

describe("bareEvmAddress", () => {
  const hex = "0x1111111111111111111111111111111111111111";
  it("accepts a plain address or a CAIP-10 id and rejects anything else", () => {
    expect(bareEvmAddress(hex)).toBe(hex);
    expect(bareEvmAddress(`eip155:1:${hex}`)).toBe(hex);
    expect(
      bareEvmAddress(
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:HAgk14CToKGpm4rGCyVc5J8mQCGGvaJfYSxUJZ8AXfBW",
      ),
    ).toBeNull();
    expect(bareEvmAddress("0x123")).toBeNull();
    expect(bareEvmAddress(null)).toBeNull();
    expect(bareEvmAddress(undefined)).toBeNull();
  });
});
