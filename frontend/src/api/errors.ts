/**
 * API-010's error envelope: `{"error": {"code", "message", "fields"?}}`.
 * Not generated from the OpenAPI schema (API-021's concern) because it
 * genuinely isn't *in* that schema — FastAPI only documents per-endpoint
 * `response_model`s, and this shape comes from the backend's global
 * exception handlers (BE-042/API-013), which apply uniformly across every
 * endpoint rather than being declared on any single one. Hand-writing
 * this specific type is the only option, not a shortcut around API-021.
 */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

/**
 * Thrown by `apiFetch` (src/api/client.ts) for every non-2xx response.
 * Carries the parsed envelope so callers can branch on `code` (e.g.
 * `PASSWORD_CHANGE_REQUIRED`) or map `fields` back onto form inputs
 * (FE-021) without re-parsing the response body themselves.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]> | undefined;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.error.code;
    this.fields = envelope.error.fields;
  }
}
