# debug-runbook / agent-debugger

**Runbook-driven backend incident investigation for AI agents.**

`debug-runbook` encodes the troubleshooting workflows of senior engineers into executable Runbooks. It empowers AI Agents to sequentially collect evidence, evaluate decision rules, and ultimately output structured incident reports.

> **Status:** Early open-source MVP. Contributions are welcome!

[Read this in Chinese (简体中文)](README_zh.md)

---

## The Core Philosophy

Most AI debugging demos simply expose low-level tool APIs to LLMs, which lacks investigation order, evidence standards, and drift detection (hallucination control).

`debug-runbook` encodes these missing constraints:

1. **Runbook Selection**: Selects the best-matching investigation playbook based on the weight of symptom signals.
2. **Ordered Execution**: Calls adapters strictly in the sequence declared by the Runbook.
3. **Evidence Normalization**: Normalizes all tool return values into `Evidence` objects, rather than dumping raw payloads (saving tokens and reducing noise).
4. **Decision Engine**: Combines evidence types to trigger specific conclusions. Every conclusion must be backed by evidence.
5. **Structured Reporting**: Outputs the root cause, confirmed facts, alternative hypotheses, and next steps.

---

## Quick Start

### Installation

```bash
pnpm install
pnpm build
```

### Configuration

```bash
cp agent-debugger.config.example.yaml agent-debugger.config.yaml
# Fill in your Langfuse / DB / Redis credentials
```

```yaml
# agent-debugger.config.yaml
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
    key_prefix_allowlist: ["cache:order:", "idempotency:"]
```

### Connect to AI via MCP

Add this to your Claude Desktop or OpenClaw MCP configuration:

```json
{
  "mcpServers": {
    "agent-debugger": {
      "command": "node",
      "args": ["/path/to/debug-runbook/dist/mcp/server.js"],
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

Then simply prompt the AI:

> `investigate` `trace_id=abc123`, Symptom: Order was created successfully but the downstream task wasn't generated. Expected: There should be a corresponding record in the tasks table.

### Run Local Demos (No real systems required)

```bash
npm run demo:order-task-missing
npm run benchmark        # Should pass all test cases
npm run check            # Metadata structure validation
```

---

## Architecture

```text
Incident Input (context_id + symptom + expected)
       ↓
[Runbook Selector]   Matches signal weights via *.selector.json
       ↓
[Executor]           Calls adapters in order defined by *.execution.json
       ↓
[Adapter Layer]      Langfuse / PostgreSQL / Redis → Evidence[]
       ↓
[Decision Engine]    Matches rules via *.decision.json → Conclusion + Confidence
       ↓
[Reporter]           Structured IncidentReport
```

### Directory Structure

```text
debug-runbook/
├── src/                    # TypeScript source code
│   ├── adapters/           # Langfuse / DB / Redis adapters
│   ├── core/               # selector / executor / reporter
│   ├── config/             # YAML config loader
│   ├── mcp/server.ts       # MCP Server entrypoint
│   └── types/              # Global Zod schemas
├── runbooks/               # Troubleshooting playbooks (YAML + JSON sidecars)
├── adapters/               # Adapter normalization metadata (JSON)
├── evidence-policies/      # Cross-source derived evidence rules
├── fixtures/               # Replayable mock cases
├── scripts/                # Demos and benchmark scripts
└── docs/                   # Design documentation
```

---

## Built-in Runbooks

| Runbook | Scenario |
|---------|---------|
| `request_not_effective` | Request succeeded but expected side-effects did not occur (e.g., order created but task missing) |
| `cache_stale` | Returned value contradicts persisted state, suspected stale cache |
| `state_abnormal` | The persisted state itself does not match business expectations |

### Adding a Custom Runbook

1. Create `your-runbook.yaml` (See `docs/runbook-spec.md`)
2. Create companion files: `.selector.json` / `.execution.json` / `.decision.json`
3. Add the path to the `runbooks:` list in `agent-debugger.config.yaml`

---

## Security Constraints

- **Read-Only**: All adapters are strictly read-only. There are no write operations in the MVP.
- **SQL Safety**: Intercepts dangerous statements like INSERT/UPDATE/DELETE/DROP.
- **Table Allowlist**: DB adapter can only access specified tables.
- **Key Prefix Allowlist**: Redis adapter can only access keys with specified prefixes.
- **Field Filtering**: Langfuse span fields are filtered by allowlist to prevent token explosion.

---

## Documentation

- [Architecture Design](docs/architecture.md)
- [Evidence Model](docs/evidence-model.md)
- [Runbook Specification](docs/runbook-spec.md)
- [Adapter Specification](docs/tool-adapter-spec.md)
- [Evaluation](docs/evaluation.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT
