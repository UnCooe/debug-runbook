# 🪛 Case Study: Adapting to Your Business System

This guide uses a realistic **DAG (Directed Acyclic Graph) Intelligence Analysis System** as an example to show you how to connect your business system to `agent-debugger` and configure an automated troubleshooting flow with zero code.

---

## Business Context

Suppose your team maintains an intelligence analysis system. The processing of each piece of intelligence is an asynchronous task flow based on a DAG, containing multiple nodes: Data Scraping → Text Cleaning → Vectorization → LLM Analysis → Result Ingestion.

Because there are many nodes, long execution times, and multiple external APIs involved, online troubleshooting has always been a pain point:
- **Pain Point 1**: A single node failure causes the final result to be missing. Tracing the complete chain is very time-consuming.
- **Pain Point 2**: Troubleshooting follows a "fixed routine". Usually, you just look at the Langfuse Trace, check if specific Spans report errors, and then search the database for ingestion records.

To solve this problem, the team decided to use `agent-debugger` to solidify this "fixed troubleshooting routine" and empower the LLM with it.

---

## Integration Steps

### Step 1: Enable and Configure Data Sources (Adapters)

This system mainly relies on two data sources: **Langfuse** (records the execution flow of each DAG link) and **PostgreSQL** (records the final analysis results).

Simply create or modify `agent-debugger.config.yaml` in the project root:

```yaml
adapters:
  langfuse:
    base_url: https://cloud.langfuse.com
    secret_key: ${LANGFUSE_SECRET_KEY}
    public_key: ${LANGFUSE_PUBLIC_KEY}
    span_field_allowlist:
      - input
      - output.error
      - level
      - statusMessage

  db:
    type: postgres
    connection_string: ${DATABASE_URL}
    allowed_tables: [reports, dag_tasks] # Strict security boundary: the LLM can only query these two tables
```

### Step 2: Write a Custom DAG Runbook

Create a file named `dag_node_failure.yaml` in the `runbooks/` directory, translating your senior experts' troubleshooting logic for DAG failures into machine-readable rules:

#### 1. Trigger Conditions (Selector)
Tell the LLM when to select this Runbook.
```yaml
name: dag_node_failure
description: Investigate the problem where the failure of a specific node in the DAG intelligence analysis chain results in no final output.

match:
  context_types:
    - trace_id
    - report_id
  symptoms:
    - missing report
    - dag failed
    - stuck
```

#### 2. Investigation Actions (Steps)
After the LLM selects this Runbook, in what sequence should the framework automatically query external systems?
```yaml
steps:
  # Step 1: Check Langfuse for any ERROR level Spans
  - id: check_trace_errors
    tool: trace.lookup
    required: true
    purpose: Check if any DAG node threw an exception
    params:
      trace_ref_column: langfuse_trace_id # If the initial clue is only report_id, use it to lookup trace_id

  # Step 2: Check database status
  - id: check_db_record
    tool: db.readonly_query
    required: true
    purpose: Verify if the final result truly failed to be ingested
    params:
      table: reports
      match_column: id
```

#### 3. Decision Logic (Decision Rules)
After obtaining clues (Evidence), how do you infer the incident conclusion? This is the process of crystallizing experience.

```yaml
decision_rules:
  - id: upstream_api_timeout
    when:
      all:
        - finding_type: downstream_error # Langfuse returned an Error Span
        - finding_type: db_row_missing   # The database indeed lacks results
    conclusion: External data source timeout caused the analysis flow to interrupt
    confidence: high
```

---

## What Makes This Mechanism Great?

After completing the two configuration steps above, the entire framework is equipped with the ability to handle business errors in your system.

1. **Absolute Security**. Even if the LLM hallucinates and wants to execute `DROP TABLE`, it will be immediately intercepted by the `allowed_tables` allowlist in the DB Adapter and the strong Read-Only transaction (`READ ONLY`) layer.
2. **Token Quota Protection**. If you throw a complex DAG Trace to Claude without restrictions, a single conversation could consume tens of thousands of Tokens. The `span_field_allowlist` mechanism only extracts key attributes (like `output.error`) and translates them into a few dozen words of structured Evidence, drastically reducing costs and improving reasoning accuracy.
3. **Team Knowledge Accumulation**. The next time a new colleague joins and encounters a "DAG not producing data" problem, they merely need to throw the problem description to the LLM via MCP. The LLM will automatically match `dag_node_failure.yaml`, query Langfuse and DB on their behalf, and even directly output a diagnostic report containing the error stack in the chat box.

> **Start adapting now! Go copy a version of your configuration file from `agent-debugger.config.example.yaml`.**
