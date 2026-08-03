import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/errors";
import { toFormErrors } from "@/lib/formErrors";

describe("toFormErrors", () => {
  it("maps a validation error's fields, taking the first message per field", () => {
    const error = new ApiError(422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        fields: { email: ["Invalid email.", "Second message ignored."], password: ["Too short."] },
      },
    });

    const result = toFormErrors(error);

    expect(result.fields).toEqual({ email: "Invalid email.", password: "Too short." });
    expect(result.formMessage).toBeNull();
  });

  it("falls back to formMessage when the error has no fields (e.g. a 409 conflict)", () => {
    const error = new ApiError(409, { error: { code: "CONFLICT", message: "Already suspended." } });

    const result = toFormErrors(error);

    expect(result.fields).toEqual({});
    expect(result.formMessage).toBe("Already suspended.");
  });

  it("gives a generic message for a non-ApiError (e.g. a network failure)", () => {
    const result = toFormErrors(new TypeError("Failed to fetch"));

    expect(result.fields).toEqual({});
    expect(result.formMessage).toBe("Something went wrong. Please try again.");
  });
});
