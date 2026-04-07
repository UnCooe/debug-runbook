# Security Policy

## Supported Versions

Security fixes are provided on a best-effort basis for the latest published release line.

| Version | Supported |
|---------|-----------|
| `0.1.x` | Yes |
| `< 0.1.0` | No |

## Reporting A Vulnerability

Please do **not** open a public issue for security-sensitive reports.

Preferred path:

- use GitHub private vulnerability reporting for this repository:
  - [Report a vulnerability](https://github.com/Uncooe/debug-runbook/security/advisories/new)

If private reporting is unavailable in your environment:

- open a minimal issue asking for a private contact path
- avoid including exploit details, secrets, tokens, or production data in the public issue

When reporting a vulnerability, include:

- affected version or commit
- a short description of the issue
- impact and attack preconditions
- reproduction steps or proof of concept
- any suggested remediation if you already have one

## Scope Notes

This repository includes integrations for observability and storage systems such as Postgres, Redis, and Langfuse. Please report issues that affect:

- read-only enforcement and permission boundaries
- unsafe query or key-access behavior
- config handling that could leak or corrupt secrets
- packaging or release metadata that creates a supply-chain risk

## Expectations

- reports will be reviewed on a best-effort basis
- validated issues will be fixed in the next reasonable patch or documented with mitigation guidance
- public disclosure should wait until a fix or mitigation is available
