# Contributing to Punah-Pustak

Thanks for considering a contribution. The short version:

1. **Read [`docs/architecture.md`](docs/architecture.md) first** if you're touching the backend — the layering (router → service → repository) and module-boundary rules are load-bearing, not stylistic.
2. **Set up your environment** using [`docs/development.md`](docs/development.md) — Docker Compose quick start, plus a faster backend-outside-Docker loop for iterative work.
3. **Open an issue before a large PR.** Small fixes can go straight to a PR; anything that changes behavior or touches multiple modules is cheaper to discuss as a plan first.
4. **Follow the commit and branch conventions, and make sure CI passes**, both detailed in [`docs/contributing.md`](docs/contributing.md).
5. **Add tests at the layer your change lives in** — see [`docs/testing.md`](docs/testing.md) for the pattern each layer follows and what CI's coverage gate requires.
6. **Update the relevant doc in `docs/` in the same PR** if your change alters something it currently describes. This codebase's documentation explains *why*, not just *what* — a stale doc actively misleads the next reader.

Full detail on all of the above lives in [`docs/contributing.md`](docs/contributing.md) and [`docs/development.md`](docs/development.md); this file is a short pointer to both, kept at the repository root because that's where GitHub looks for it.

## Reporting a bug or requesting a feature

Open a [GitHub issue](https://github.com/Sneha73685/Punah-Pustak/issues). Before filing a feature request, skim [SRS §4, Non-Goals](SRS-v2.1.0.md#4-non-goals) and [`docs/architecture.md`](docs/architecture.md#what-was-deliberately-not-built-and-why) — several "obvious-looking" additions (payments, in-app messaging, microservices, a cache layer) were already considered and deliberately excluded for this project's scope, and a request for one of those should engage with why it was rejected.

## Reporting a security issue

See [`SECURITY.md`](SECURITY.md) — please don't open a public issue for a security vulnerability.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you're expected to uphold it.
