# Open Source Readiness

## Current Release Level

This repository is ready for an initial open-source release as a spec-driven MVP.

Recommended framing:

- early open-source MVP
- research preview
- replayable investigation framework

Avoid framing it as:

- production-ready debugging platform
- autonomous self-healing system
- automatic bug-fix engine

## What Is Already Strong Enough To Publish

- clear project positioning
- runnable replay demo
- benchmark with hard cases
- metadata ownership split across runbooks, adapters, and evidence policies
- repository check that catches structural drift
- documentation for architecture, runbooks, adapters, evidence, and evaluation

## What Is Still Deliberately Incomplete

- no real MCP or production adapter integration in this repository
- no write path or repair automation
- no full YAML-native metadata loading yet
- no generalized planner beyond the MVP flow
- no rich evaluation dataset beyond the current fixture set

## Minimum Claims That Are Defensible Today

You can safely claim that the project:

- turns backend troubleshooting patterns into replayable agent workflows
- separates runbook logic from adapter normalization logic
- supports benchmarkable runbook selection and evidence-based conclusion generation
- includes metadata drift checks for the current MVP model

## Claims You Should Not Make Yet

Do not claim that the project:

- can debug arbitrary production incidents out of the box
- is already validated on real multi-team production systems
- performs automatic fixes safely
- generalizes beyond the current adapter and fixture model without additional integration work

## Release Checklist

Before public release, keep these true:

- `npm run check` passes
- `npm run benchmark` passes
- demo commands produce expected output
- README and status wording match the actual repository state

## Why This Is Publishable Now

The repository is no longer just an idea. It already provides:

- a concrete metadata model
- replayable examples
- benchmark coverage
- hard-case coverage
- failure detection for metadata drift

That is enough for an open-source MVP release with honest scope.
