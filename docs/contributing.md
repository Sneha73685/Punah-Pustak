# Contributing

How to propose and land a change in this repository. For the root-level, GitHub-discoverable version of this document, see [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — that file is a short pointer to this one plus [`development.md`](development.md); this one has the detail. Environment setup and the day-to-day dev loop are covered there, not repeated here.

## Before you start

- **Check the SRS's non-goals first.** [SRS §4](../SRS-v2.1.0.md#4-non-goals) and [`architecture.md`](architecture.md#what-was-deliberately-not-built-and-why) both keep an explicit list of features and patterns that were considered and deliberately rejected for this project's scope (payments, in-app messaging, microservices, a cache layer, and more). A PR reintroducing one of these needs a strong, explicit justification in its description — "it would be nice to have" isn't sufficient on its own, since the whole point of that list is that each item was already weighed once.
- **For anything beyond a small fix, open an issue first.** Describe the problem and your proposed approach before writing code — it's much cheaper to redirect a plan than a finished PR, especially against the layering rules in [`architecture.md`](architecture.md).
- **Read [`architecture.md`](architecture.md) before touching backend code.** The router → service → repository layering, the `DomainError` convention, and the module-boundary rule (module A calls module B's *service*, never its repository) are load-bearing conventions, not stylistic preferences — code that doesn't follow them will be asked to change in review.

## Commit messages

This repository follows [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`, imperative mood, present tense. Types actually in use in this history: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`. Scope is typically the module or area touched (`auth`, `listings`, `admin`, `frontend`, or omitted for something repo-wide like a `docs` or `chore` change). Examples straight from `git log`:

```
feat(admin): implement Milestone 4 administration and moderation
feat(users): implement Milestone 3 user profile management
refactor: remove legacy V1 static frontend
```

Keep the subject line under ~72 characters; put *why*, not just *what*, in the body when the reasoning isn't obvious from the diff alone — the same principle [`architecture.md`](architecture.md) and the other docs in this repository are written by.

## Branches

Branch from `main`, name the branch `type/short-description` matching the commit-type vocabulary above (e.g. `feat/listing-favorites`, `fix/refresh-token-cookie-path`, `docs/api-reference`). Keep a branch scoped to one logical change — a branch mixing an unrelated refactor into a feature PR makes review harder for no benefit.

## Pull requests

1. **Open the PR against `main`.**
2. **CI must be green before merge.** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs four jobs on every PR: backend lint + strict type-check (Ruff, mypy), backend tests with a coverage gate (≥85% on `service`/`repository` modules), frontend type-check (`tsc --noEmit`), and frontend tests + production build. See [`testing.md`](testing.md) for what each of these actually verifies.
3. **New behavior needs a test at the layer it lives in** — a new service method gets a unit test against a fake repository; a new repository query that depends on Postgres-specific behavior gets an integration test against real Postgres; a new endpoint gets at least a happy-path, an authorization-failure, and a validation-failure test. See [`testing.md`](testing.md#backend-pytest) for the concrete pattern each type follows.
4. **Run the local pre-commit hooks before pushing** — see [`development.md`](development.md#before-your-first-commit-install-the-hooks). A PR that fails Ruff/mypy in CI when the hook would have caught it locally is avoidable friction for both author and reviewer.
5. **Describe the *why*, not just the *what*, in the PR description** — a one-line summary of the change plus the reasoning behind any non-obvious decision. If the change intentionally deviates from a pattern documented elsewhere in `docs/`, say so and say why; if it should update one of those documents, include that update in the same PR (see "Keeping docs in sync" below).

Merges use GitHub's merge commit (not squash or rebase), matching this repository's existing history (`Merge PR #N: <description>`) — this keeps the individual, reviewable commits from a PR intact in `main`'s history rather than collapsing them.

## Code review expectations

This project currently has a single maintainer, so review is self-review against the same standard an external reviewer would apply: does the change follow the layering and error-handling conventions in [`architecture.md`](architecture.md); does it have tests at the right layer; does it avoid reintroducing something from the deliberate-simplicity list; is a genuinely non-obvious decision explained in a comment or the PR description rather than left implicit. External contributions are reviewed against the same checklist.

## Keeping docs in sync

`docs/` is written to explain *why*, not just *what* — see the top of [`architecture.md`](architecture.md). If your change alters something a document currently describes (a module's responsibilities, an endpoint's shape, a schema column, a security trade-off), update that document in the same PR rather than letting it drift. A stale architectural doc is worse than no doc, since it actively misleads the next reader instead of just being silent.

## Related documents

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — short root-level version of this document
- [`development.md`](development.md) — environment setup and the day-to-day dev loop
- [`architecture.md`](architecture.md) — the conventions a change is reviewed against
- [`testing.md`](testing.md) — what's tested, how, and what CI gates on
