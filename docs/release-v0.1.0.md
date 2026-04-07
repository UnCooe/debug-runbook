# v0.1.0 Release Notes Draft

## Summary

`agent-debugger` is an early open-source MVP for turning repeated backend troubleshooting habits into executable runbooks for AI agents.

Repository: `debug-runbook`

This release focuses on one narrow but reusable layer:

- runbook selection
- ordered evidence collection
- evidence normalization
- evidence-based conclusion generation
- MCP-based integration surface

It does **not** ship the original internal production DAG, permission system, or repair workflows that inspired the project.

## Why This Exists

Many online incidents are investigated with a repeatable sequence:

1. compare actual behavior with the expected result
2. inspect cache
3. inspect persistence
4. inspect trace / execution flow
5. decide which evidence-backed conclusion is most likely

This repository packages that style of investigation into a replayable, inspectable framework.

## What Is Included In v0.1.0

- zero-config replay demo
- benchmark over built-in fixture cases
- metadata consistency checks
- built-in runbooks for:
  - missing expected side effects
  - stale cache views
  - abnormal persisted state
- custom runbook loading through config
- read-only adapter model for Langfuse, Postgres, and Redis

## Context Coverage In This Release

Built-in runbooks intentionally cover a limited set of locator types:

- `request_not_effective`: `request_id`, `order_id`
- `cache_stale`: `order_id`, `task_id`
- `state_abnormal`: `order_id`, `task_id`

Broader locator support should be added through custom runbooks or later releases.

## What Changed Before This Release

- rewrote the README around a real incident pattern and a zero-config demo path
- reduced installation friction by adding `pnpm demo`
- fixed config interpolation so unresolved env vars are preserved safely
- made `runbooks:` config entries work at runtime for custom runbooks
- tightened package boundaries with `engines`, `files`, and `prepack`
- documented MVP boundaries more explicitly

## Suggested Validation Commands

```bash
pnpm test -- --run
pnpm build
pnpm demo
pnpm benchmark
pnpm check
npm pack --dry-run
```

## Known Limits

- built-in runbooks are intentionally narrow
- benchmark results validate replay cases, not every real integration path
- no write-path or repair automation is shipped in this repository
- real production observability and orchestration setup must be provided by the user

## Suggested Launch Framing

Use wording like:

- early open-source MVP
- research preview
- replayable incident investigation framework

Avoid wording like:

- production-ready self-healing platform
- general autonomous debugging engine
- safe automatic repair system
