import { describe, expect, it } from "vitest";
import { base58Encode, base64Decode } from "./codec";

describe("native codec", () => {
  it("encodes leading zero bytes in base58 and decodes base64", () => {
    expect(base58Encode(Uint8Array.from([0, 0, 1]))).toBe("112");
    expect(base64Decode("aGVsbG8=")).toEqual(
      new TextEncoder().encode("hello"),
    );
  });
});
