# agent-debugger

**Runbook-driven backend incident investigation for AI agents.**

> Status: early open-source MVP.
>
> This repository was inspired by a real internal AI troubleshooting and self-healing workflow. The original production DAG, permissions, and observability plumbing are private and are not reproduced here. This repo focuses on the reusable layer: runbooks, evidence normalization, decision logic, and an MCP entrypoint.

[Read this in Chinese (Simplified Chinese)](README_zh.md)

## Does This Sound Familiar?

Many online incidents are not hard because they are unique. They are hard because engineers keep replaying the same investigation sequence by hand:

- Compare actual behavior with the expected result.
- Check whether Redis is already wrong.
- Check whether the database source of truth is wrong.
- Check the trace to see where the workflow stopped.
- Decide whether the issue is stale cache, missing side effects, or abnormal persisted state.

Example:

- A detail page returns the wrong asset state.
- The expected investigation order is stable: inspect cache, inspect DB, inspect trace, inspect external dependencies.
- The useful input for the agent is also stable: `trace_id`, expected result, actual result.

`agent-debugger` exists for that pattern. It turns repeated troubleshooting habits into executable runbooks so an agent can gather evidence in order instead of guessing freely.

## What This Repo Actually Implements

- A runbook selector that scores incident patterns and picks the best-matching investigation path.
- An executor that calls adapters in a fixed order defined by the runbook.
- Evidence normalization so tool output becomes compact, structured findings instead of raw payload dumps.
- A decision engine that maps evidence combinations to conclusions and next actions.
- An MCP server entrypoint so the investigation flow can be exposed to AI tools.

## 5-Minute Demo

The zero-config path is the fastest way to understand the project. It uses replayable fixtures and does not require Langfuse, Postgres, or Redis credentials.

Requirements:

- Node.js `>= 18.17`
- `pnpm`

Run:

```bash
pnpm install
pnpm demo
pnpm benchmark
pnpm check
```

What you get:

- A runnable incident walkthrough from fixture input to structured report.
- A benchmark over the built-in replay cases.
- A metadata consistency check for runbooks, adapters, and evidence policies.

Important:

- `pnpm demo` and `pnpm benchmark` validate replayable investigation cases.
- They are meant to prove the investigation model and repository structure, not to claim full production integration coverage.

## A Concrete Demo Scenario

The default demo replays this kind of incident:

- Actual: an order was created, but the downstream task was never generated.
- Expected: a task record should exist after order creation.
- Investigation order: trace -> persistence -> idempotency/cache.

The output shows:

- which runbook was selected
- which evidence items were confirmed
- which conclusion fired
- which next actions were recommended

## Connect To Real Systems

After the zero-config demo, you can connect the MCP server to your own observability and storage systems.

Build the server:

```bash
pnpm build
```

Create a config file:

```bash
cp agent-debugger.config.example.yaml agent-debugger.config.yaml
```

Example:

```yaml
adapters:
  langfuse:
    base_url: https://cloud.langfuse.com
    secret_key: ${LANGFUSE_SECRET_KEY}
    public_key: ${LANGFUSE_PUBLIC_KEY}
  db:
    type: postgres
    connection_string: ${DATABASE_URL}
    allowed_tables: [orders, tasks]
  redis:
    url: ${REDIS_URL}
    key_prefix_allowlist: ["idempotency:", "task:idempotent:", "order:view:", "task:view:"]

runbooks:
  - ./runbooks/request_not_effective.yaml
```

Add the MCP server to your AI client:

```json
{
  "mcpServers": {
    "agent-debugger": {
      "command": "node",
      "args": ["/path/to/agent-debugger/dist/mcp/server.js"],
      "env": {
        "LANGFUSE_SECRET_KEY": "sk-...",
        "LANGFUSE_PUBLIC_KEY": "pk-...",
        "DATABASE_URL": "postgresql://...",
        "REDIS_URL": "redis://..."
      }
    }
  }
}
```

Then provide a concrete incident:

> Investigate `order_id=order_123`. Actual: order was created but no task was generated. Expected: a task row should exist.

## What This Repo Is Not

- It is not the original internal production system.
- It is not a generic autonomous bug-fixing platform.
- It does not ship the private DAG orchestration, permission system, or internal repair workflows from the original environment.
- It does not grant unlimited automatic repair authority.

## Safety Boundaries

- All adapters in this MVP are read-only.
- SQL queries are guarded against write operations.
- DB access is limited by a table allowlist.
- Redis access is limited by a key-prefix allowlist.
- Langfuse span fields are filtered by allowlist before being turned into evidence.

## Built-In Runbooks

| Runbook | Scenario |
|---------|---------|
| `request_not_effective` | A request succeeded but the expected side effect did not happen |
| `cache_stale` | Cached state appears inconsistent with persistence |
| `state_abnormal` | Persisted business state itself looks incorrect |

Current built-in context coverage is intentionally narrow:

- `request_not_effective`: `request_id`, `order_id`
- `cache_stale`: `order_id`, `task_id`
- `state_abnormal`: `order_id`, `task_id`

If you want broader locator support such as `trace_id` or `user_id`, add a custom runbook through `runbooks:` in the config file.

Custom runbooks are supported through `runbooks:` entries in the config file. Each custom runbook should include sibling `.selector.json`, `.execution.json`, and `.decision.json` metadata files.

## Architecture

```text
Incident Input (context_id + symptom + expected)
       ↓
[Runbook Selector]   Matches signal weights via *.selector.json
       ↓
[Executor]           Calls adapters in order defined by the runbook
       ↓
[Adapter Layer]      Langfuse / PostgreSQL / Redis -> Evidence[]
       ↓
[Decision Engine]    Maps evidence to a conclusion and next actions
       ↓
[Reporter]           Structured IncidentReport
```

## Documentation

- [Architecture Design](docs/architecture.md)
- [Evidence Model](docs/evidence-model.md)
- [Runbook Specification](docs/runbook-spec.md)
- [Adapter Specification](docs/tool-adapter-spec.md)
- [Evaluation](docs/evaluation.md)
- [Release Checklist](docs/release-checklist.md)
- [Release Announcement Draft](docs/release-announcement.md)
- [v0.1.0 Release Notes Draft](docs/release-v0.1.0.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
