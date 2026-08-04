# Security Policy

## Supported versions

Only the current `main` branch (V2, per [`SRS-v2.1.0.md`](SRS-v2.1.0.md)) is maintained. The V1 prototype has been removed from the repository (see `git log` for `refactor: remove legacy V1 static frontend`) and receives no fixes of any kind.

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security vulnerability.** Instead, use one of:

- GitHub's [private vulnerability reporting](https://github.com/Sneha73685/Punah-Pustak/security/advisories/new) ("Report a vulnerability" under the repository's Security tab), if enabled.
- A direct message to [@Sneha73685](https://github.com/Sneha73685) on GitHub.

Please include enough detail to reproduce the issue (affected endpoint or component, request/response if relevant, and impact). This is a small, single-maintainer project — there's no formal SLA, but reports are the highest-priority item in the queue when they arrive.

## Scope and known trade-offs

This project documents its security model and its deliberate trade-offs in detail rather than treating them as implicit — see [`docs/authentication.md`](docs/authentication.md) (token lifecycle, password handling, suspension semantics) and [SRS §15](SRS-v2.1.0.md#15-security-requirements) (the full requirements list). A few of the more consequential, already-known trade-offs, so they aren't re-reported as new findings:

- **No self-service password reset.** Account recovery is manual and admin-assisted only — see [`docs/authentication.md`](docs/authentication.md#forced-password-change). This is a deliberate scope decision (no email/notification infrastructure exists in this project), not an oversight.
- **A revoked access token remains technically valid until its own expiry (≤15 minutes)** after a suspension or logout, by design — see [`docs/authentication.md`](docs/authentication.md#suspension-bounded-immediate-not-instantaneous).
- **The rate limiter and any future in-process caching are single-instance, in-memory designs**, matching this project's stated single-application-instance deployment target (see [`architecture.md`](docs/architecture.md#guiding-constraint-target-scale)) — they are not resilient to a horizontally-scaled deployment, which this version does not support.

A genuine vulnerability *within* that documented scope — e.g. a way to bypass an ownership check, forge a token, or exfiltrate a refresh token — is exactly what this policy wants reported.

## Automated checks currently in place

CI runs backend lint/type-check (Ruff, mypy `--strict`) and the full test suite on every PR — see [`docs/testing.md`](docs/testing.md). There is currently no automated dependency-vulnerability scanning (e.g. Dependabot alerts) or SAST tooling configured in this repository; this is a known gap, not a claim of exhaustive automated coverage.
