import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useValidateDestination } from "./useValidateDestination";

describe("useValidateDestination (Vue)", () => {
  it("tracks the address ref and reports the shared core's verdict", () => {
    const address = ref<string | null>(null);
    const { validation } = useValidateDestination(address);
    expect(validation.value).toEqual({
      isValid: false,
      level: "blocked",
      issue: "empty",
    });

    address.value = "0x000000000000000000000000000000000000dead";
    expect(validation.value.issue).toBe("burn_address");

    address.value = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    expect(validation.value).toEqual({
      isValid: true,
      level: "ok",
      issue: null,
    });
  });
});
