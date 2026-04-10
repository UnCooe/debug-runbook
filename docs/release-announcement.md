# Release Announcement Draft

## Short Version

Open-sourced `agent-debugger`.

It is a runbook-driven backend incident investigation framework for AI agents.

This repository came from a real internal AI troubleshooting workflow, but it is not the original private production system. The internal DAG orchestration, permissions, and observability plumbing are not included here. What is open-sourced is the reusable investigation layer:

- runbook selection
- ordered evidence collection
- adapter normalization
- evidence-based conclusion generation
- replayable demos and benchmark cases

This first release is an early open-source MVP focused on replayable investigation, explainable outputs, and honest scope.

## Longer Version

I am open-sourcing `agent-debugger`, a small framework for encoding repeated backend troubleshooting workflows into something an AI agent can execute with more discipline.

The motivation is simple: many online incidents are not mysterious, but the investigation process is still repeated manually. Engineers often follow a stable sequence:

1. compare actual behavior with the expected result
2. inspect cache
3. inspect the database source of truth
4. inspect traces to see where the flow stopped
5. decide on the most likely cause based on evidence

This repository packages that reusable layer into:

- runbooks for investigation order
- adapter normalization metadata for evidence extraction
- a selector and executor for repeatable flows
- replayable fixtures for zero-config demos
- benchmark and metadata checks to catch drift

What it is not:

- not the original private production DAG
- not a production-ready self-healing platform
- not a generic autonomous bug-fix engine

The right way to evaluate this release is:

1. run the zero-config demo
2. inspect the runbooks and decision metadata
3. run the benchmark and metadata check
4. decide whether this investigation model fits your own incident patterns

## Suggested Footer

- Repo: `debug-runbook`
- Package: `agent-debugger`
- Status: early open-source MVP
- Fastest path: `pnpm install && pnpm demo`
- Validation: `pnpm benchmark && pnpm check`
