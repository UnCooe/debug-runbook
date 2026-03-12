# debug-runbook

Runbook-driven backend incident investigation for AI agents.

`debug-runbook` turns senior backend troubleshooting workflows into a replayable framework that an agent can execute with evidence, sequence, and safety constraints.

It is an early open-source MVP, not a production-ready self-healing platform.

## Why This Exists

Most backend debugging is repetitive, but it should not be random.

When incidents happen, experienced engineers usually follow a stable path:

1. confirm the request or event entered the system
2. find where the flow stopped
3. verify persisted state
4. inspect cache and async side effects
5. compare evidence before making a root-cause call

Most AI debugging demos expose tools without investigation order, evidence standards, or drift checks.

`debug-runbook` is an attempt to encode those missing constraints.

## What You Get Today

- runbook-driven investigation flow
- adapter-level evidence normalization metadata
- replayable demos and benchmark cases
- hard cases for selector ambiguity
- metadata drift checks and an intentional failure demo

## What It Is Not

- not an auto-fix system
- not a write-enabled production operator
- not a production-ready debugging platform
- not tied to one vendor such as Langfuse

## Project Status

Current release level: early open-source MVP / research preview.

Useful entry points:

- [open-source-readiness.md](/C:/Users/31947/project/playground/agent-debugger/docs/open-source-readiness.md)
- [naming-recommendation.md](/C:/Users/31947/project/playground/agent-debugger/docs/naming-recommendation.md)
- [release-announcement.md](/C:/Users/31947/project/playground/agent-debugger/docs/release-announcement.md)
- [CONTRIBUTING.md](/C:/Users/31947/project/playground/agent-debugger/CONTRIBUTING.md)
- [LICENSE](/C:/Users/31947/project/playground/agent-debugger/LICENSE)

## Quick Start

Run the repository checks:

```bash
npm run check
npm run benchmark
```

Run a demo case:

```bash
npm run demo:order-task-missing
```

Run the intentional failure demo:

```bash
npm run check:demo-fail
```

## MVP Scope

The current repository stays intentionally narrow:

- input: `context_id`, `context_type`, `symptom`, `expected`
- adapters: `trace`, `db_readonly`, `redis`
- runbooks:
  - `request_not_effective`
  - `state_abnormal`
  - `cache_stale`
- output: structured incident report
- safety: read-only, allowlisted, auditable

## Architecture Split

Metadata ownership is explicit:

- `runbooks/*.selector.json` owns runbook selection signals
- `runbooks/*.execution.json` owns operation order
- `runbooks/*.decision.json` owns evidence-to-conclusion rules and report wording
- `adapters/*/*.normalization.json` owns raw-response to evidence normalization
- `evidence-policies/*.json` owns cross-source derived evidence rules
- `scripts/check.mjs` validates structure and catches drift between these layers

## Benchmark Status

Current replay benchmark includes normal and hard ambiguous cases.

Current passing status:

- runbook selection: `7/7`
- conclusion accuracy: `7/7`
- hard-case pass rate: `3/3`

## Repository Layout

```text
debug-runbook/
©À©¤©¤ README.md
©À©¤©¤ CONTRIBUTING.md
©À©¤©¤ LICENSE
©À©¤©¤ docs/
©À©¤©¤ adapters/
©À©¤©¤ evidence-policies/
©À©¤©¤ metadata-schemas/
©À©¤©¤ runbooks/
©À©¤©¤ schemas/
©À©¤©¤ fixtures/
©À©¤©¤ scripts/
©¸©¤©¤ examples/
```

## Safety Boundaries

Read-only access alone is not enough. The framework also assumes:

- query allowlists
- row and time limits
- sensitive field masking
- environment isolation
- audit logging for every tool call

## Hard Cases

The benchmark includes intentionally confusing cases that mix overlapping cues such as:

- `order_id`
- `status`
- `not generated`
- `returns pending`

This matters because average pass rate can hide selector weakness.
