# Release Announcement Draft

## Short Version

Open-sourced `debug-runbook`.

It is a runbook-driven backend incident investigation framework for AI agents.

The project is based on a simple idea: most backend debugging is repetitive, but it should not be random. Senior engineers usually follow a stable investigation path, collect evidence from traces, persistence, cache, and dependencies, and only then make a root-cause call.

`debug-runbook` turns that workflow into a replayable framework with:

- runbook metadata for investigation order
- adapter normalization metadata for evidence generation
- benchmarkable runbook selection
- hard cases for ambiguity stress
- drift checks so metadata changes do not silently break the model

This is not a production-ready self-healing system. The current release is an early open-source MVP focused on replayable investigation, explainable outputs, and structured engineering boundaries.

Repo highlights:

- runnable replay demo
- benchmark with hard cases
- metadata ownership split across runbooks, adapters, and evidence policies
- intentional failure demo for metadata drift checks

## Long Version

I have open-sourced `debug-runbook`, a small framework for turning backend troubleshooting workflows into something an AI agent can execute with more discipline.

The core premise is simple: production debugging is repetitive, but it should not be guessy. In real systems, experienced backend engineers tend to follow a repeatable sequence:

1. confirm whether the request entered the system
2. identify where the flow stopped
3. verify persisted state
4. inspect cache or async side effects
5. compare evidence before proposing root cause

Most AI debugging demos skip that structure. They expose tools, but not investigation order. They produce answers, but not evidence standards.

`debug-runbook` is an attempt to encode that missing structure.

Current MVP features:

- runbook-driven investigation flow
- evidence normalization separated from runbook logic
- replayable fixture-based demos
- benchmark coverage, including hard ambiguous cases
- metadata drift checks with an intentional failure demo

What it is not:

- not a production operator
- not an autonomous self-healing platform
- not an automatic bug-fix engine

This first release is intentionally narrow, but it is already concrete enough to inspect, run, benchmark, and extend.

If you are working on AI-assisted incident response, backend troubleshooting automation, or agent tooling with observability integrations, feedback is welcome.

## Suggested Post Footer

- Repo: `debug-runbook`
- Status: early open-source MVP
- Best starting points: `README.md`, `docs/open-source-readiness.md`, `npm run benchmark`, `npm run check`
