## What and why

<!-- One-line summary of the change, plus the reasoning behind any
non-obvious decision. See docs/contributing.md for what "non-obvious"
means in this repository's context. -->

## Checklist

- [ ] Follows the layering/module-boundary rules in [`docs/architecture.md`](../docs/architecture.md) (backend changes only)
- [ ] Has a test at the layer the change lives in — see [`docs/testing.md`](../docs/testing.md)
- [ ] `ruff check . && ruff format --check . && mypy app alembic tests` pass locally (backend changes)
- [ ] `npx tsc --noEmit && npm run test && npm run build` pass locally (frontend changes)
- [ ] Relevant document(s) under `docs/` updated in this same PR, if this change alters something they describe
- [ ] Does not reintroduce something from the [deliberate-simplicity list](../docs/architecture.md#what-was-deliberately-not-built-and-why) without explicit justification above
