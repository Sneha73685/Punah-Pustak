/**
 * Isolated, unique test data per run — every spec/test gets its own email
 * and listing title so runs never collide with data left behind by a
 * previous run (or, with `workers: 1`, with each other).
 */

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${RUN_ID}${counter}`;
}

/**
 * `example.com`, not the more obvious `*.test` — the backend's `EmailStr`
 * validation (`email-validator`, syntax-only, no DNS lookup: pydantic pins
 * `check_deliverability=False`) unconditionally rejects the `.test` TLD as
 * an IANA special-use domain regardless of that setting, so a `.test`
 * address here isn't a fake-but-valid test email, it's a genuine 422 for
 * every spec. `example.com/.net/.org` are RFC 2606 reserved for
 * documentation too, but this library deliberately does not reject them
 * (see `email_validator`'s `SPECIAL_USE_DOMAIN_NAMES` list) — the standard
 * choice for exactly this "looks fake, validates as real" need.
 */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${nextId()}@example.com`;
}

export function uniqueTitle(prefix: string): string {
  return `${prefix} ${nextId()}`;
}

/**
 * Not a real secret: this is the one password used for every ephemeral,
 * uniquely-emailed account this suite creates and discards within a single
 * local/CI run against a throwaway database — it protects nothing of
 * value. Meets SEC-011 (10+ characters) so it never disagrees with the
 * client/server validation under test.
 */
export const TEST_PASSWORD = "e2e-suite-throwaway-pw-1";
