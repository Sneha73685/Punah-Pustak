import { ApiError } from "@/api/errors";

export interface FormErrors {
  /** One message per field, first-wins if the API returned several. */
  fields: Record<string, string>;
  /** Set when the error isn't (only) field-level — e.g. a 409 conflict,
   * or a validation error with no `fields` at all — so the form can still
   * show *something* even when there's no specific input to attach it to. */
  formMessage: string | null;
}

/**
 * FE-021: "Form validation errors from the API (422 with fields) MUST be
 * mapped back to the corresponding input." Centralized here rather than
 * re-implemented per form, the same "implement a cross-cutting concern
 * once" reasoning the backend's own BE-042/API-013 already applies to the
 * API-010 envelope itself.
 */
export function toFormErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return { fields: {}, formMessage: "Something went wrong. Please try again." };
  }
  const fields: Record<string, string> = {};
  if (error.fields) {
    for (const [field, messages] of Object.entries(error.fields)) {
      if (messages.length > 0) {
        fields[field] = messages[0];
      }
    }
  }
  const formMessage = Object.keys(fields).length > 0 ? null : error.message;
  return { fields, formMessage };
}
