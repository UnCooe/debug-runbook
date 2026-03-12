# Contributing

## Scope

This repository is an early open-source MVP.

Contributions are welcome, but changes should preserve the current project shape:

- runbook semantics live in metadata, not in hardcoded runner branches
- adapter normalization lives in adapter metadata, not in runbook files
- replayability and inspectability matter more than cleverness
- benchmark and check should stay green

## Before You Change Anything

Read these first:

- `README.md`
- `docs/architecture.md`
- `docs/runbook-spec.md`
- `docs/tool-adapter-spec.md`
- `docs/open-source-readiness.md`

## Contribution Areas That Fit Well

Good first contribution areas:

- add new replayable fixture cases
- add hard cases that stress selector ambiguity
- improve metadata validation in `scripts/check.mjs`
- improve documentation clarity
- add new adapter normalization metadata for future mock operations

Contribution areas that need more caution:

- changing runbook metadata format
- changing evidence finding taxonomy
- changing benchmark scoring semantics
- adding write or repair behavior

## Repository Invariants

Please preserve these invariants:

- runbook selection comes from `runbooks/*.selector.json`
- execution order comes from `runbooks/*.execution.json`
- conclusion logic and report wording come from `runbooks/*.decision.json`
- raw-response normalization comes from `adapters/*/*.normalization.json`
- cross-source derived evidence comes from `evidence-policies/*.json`

If a change breaks one of these boundaries, explain why in the PR or issue.

## Local Checks

Run these before proposing changes:

```bash
npm run check
npm run benchmark
```

Optional sanity checks:

```bash
npm run demo:order-task-missing
npm run check:demo-fail
```

## Adding A New Runbook

When adding a runbook, keep the repository consistent:

1. add `runbooks/<name>.yaml`
2. add `runbooks/<name>.selector.json`
3. add `runbooks/<name>.execution.json`
4. add `runbooks/<name>.decision.json`
5. add or reuse adapter normalization metadata for every referenced operation
6. add at least one fixture case under `fixtures/cases/`
7. make sure `npm run check` and `npm run benchmark` still pass

## Adding A New Operation

When adding a new operation:

1. choose the adapter directory under `adapters/`
2. add `<operation>.normalization.json`
3. make sure the operation name matches what runbook execution metadata references
4. update fixtures so the new operation has replayable response data if it is exercised

## Pull Request Expectations

A good contribution should make these easy to review:

- what changed
- which layer changed: runbook, adapter, evidence policy, runner, or docs
- whether new findings or operations were introduced
- whether `npm run check` and `npm run benchmark` passed

## Non-Goals For Now

This repository is not accepting changes that turn the MVP into:

- a production operator
- a write-enabled self-healing system
- an unrestricted SQL or shell agent
- a vendor-specific closed integration demo
