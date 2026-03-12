# Runbook Spec

## Purpose

A runbook is an executable troubleshooting contract. It tells the agent:

- what problem pattern it covers
- which checks must happen first
- what evidence is required
- how to branch
- when to stop

## Design Rules

### 1. Runbooks should be narrow enough to stay stable

Prefer a generic pattern plus team-specific specialization over one oversized runbook.

Recommended layering:

- investigation pattern: `request_not_effective`
- domain specialization: `order_created_but_task_missing`

### 2. Each step should have a clear purpose

Steps are not prompts. They are controlled investigation actions.

### 3. Conclusions require evidence

A runbook should declare which evidence types are sufficient for each conclusion.

### 4. Tool budgets should be explicit

Avoid unbounded retries or broad log scans.

### 5. Selector signals should live with the runbook

Runbook selection is part of the contract. If selection rules live somewhere else, the runbook and selector will drift.

### 6. Execution plans should live with the runbook

If operation order stays hardcoded in the runner, the repository still has two sources of truth. The runbook should own both selection metadata and execution metadata.

### 7. Decision rules should live with the runbook

If evidence interpretation stays hardcoded in the runner, the repository still has a hidden source of truth. The runbook should own the logic that maps evidence to conclusions.

### 8. Response wording should live with the runbook

If root-cause wording and next actions stay in code, the semantic layer is still split. The runbook should own not just which conclusion fires, but also how that conclusion is explained.

### 9. Confirmed-fact rendering should live with the runbook

The list of "confirmed facts" is not raw adapter output. It is a reporting choice about which evidence should be surfaced to humans. That choice belongs to the runbook, not to generic runner code.

In the current MVP, runbook metadata is stored as sidecar files:

- `runbooks/request_not_effective.selector.json`
- `runbooks/request_not_effective.execution.json`
- `runbooks/request_not_effective.decision.json`
- `runbooks/cache_stale.selector.json`
- `runbooks/cache_stale.execution.json`
- `runbooks/cache_stale.decision.json`
- `runbooks/state_abnormal.selector.json`
- `runbooks/state_abnormal.execution.json`
- `runbooks/state_abnormal.decision.json`

This is a practical compromise for a zero-dependency demo. A later version can move the same metadata into the runbook definition once YAML parsing is formalized.

## Suggested YAML Shape

```yaml
name: request_not_effective
description: Investigate why a request did not produce the expected backend effect.

match:
  context_types:
    - trace_id
    - request_id
    - order_id
  symptoms:
    - request succeeded but expected side effect is missing

inputs:
  required:
    - context_id
    - context_type
    - symptom
    - expected

limits:
  max_steps: 8
  max_tool_calls: 12

steps:
  - id: locate_trace
    tool: trace.lookup
    required: false
    purpose: confirm whether the flow can be mapped to a trace

  - id: inspect_core_path
    tool: trace.inspect_spans
    required: false
    purpose: identify where the main flow stopped

  - id: verify_persistence
    tool: db.readonly_query
    required: true
    purpose: check whether expected state was persisted

  - id: inspect_cache
    tool: redis.inspect
    required: false
    purpose: detect stale cache or idempotency short-circuit

decision_rules:
  - id: trace_missing
    when:
      all:
        - finding_type: trace_missing
    conclusion: request_not_observable_via_trace
    confidence: low

  - id: persistence_missing
    when:
      all:
        - finding_type: db_row_missing
    conclusion: request_did_not_reach_persistence
    confidence: medium

  - id: stale_idempotency
    when:
      all:
        - finding_type: db_row_missing
        - finding_type: cache_key_exists
        - finding_type: cache_ttl_positive
    conclusion: request_short_circuited_by_cache_or_idempotency
    confidence: high

output:
  schema: incident_report
  require_evidence: true
```

## Selector Metadata Shape

```json
{
  "name": "request_not_effective",
  "priority": 2,
  "context_types": ["trace_id", "request_id", "order_id"],
  "positive_signals": [
    { "pattern": "not generated", "weight": 2.5 },
    { "pattern": "should be created", "weight": 1.5 },
    { "pattern": "(not generated|did not|missing)", "weight": 2, "mode": "regex" }
  ],
  "negative_signals": [
    { "pattern": "status is", "weight": -2 }
  ]
}
```

## Execution Metadata Shape

```json
{
  "name": "request_not_effective",
  "operations": [
    "trace.lookup",
    "trace.inspect_spans",
    "db.readonly_query",
    "redis.inspect"
  ]
}
```

## Decision Metadata Shape

```json
{
  "name": "request_not_effective",
  "confirmed_fact_templates": [
    { "finding_type": "trace_found", "text": "Trace data confirms the request or entity entered an observable service flow." }
  ],
  "rules": [
    {
      "id": "cache_short_circuit",
      "all": ["db_row_missing", "cache_key_exists", "cache_ttl_positive"],
      "conclusion": "request_short_circuited_by_cache_or_idempotency",
      "confidence": 0.88,
      "root_cause": "The request was most likely short-circuited by cache or idempotency state before the expected side effect executed.",
      "recommended_next_actions": [
        "Check which workflow wrote the idempotency or cache key.",
        "Verify whether retry or guard logic pre-created the key."
      ]
    }
  ],
  "fallback": {
    "conclusion": "investigation_inconclusive",
    "confidence": 0.4,
    "root_cause": "The available evidence is insufficient to isolate a single root cause."
  }
}
```

## Required Semantics

Each runbook should define:

- `match`
- `inputs`
- `limits`
- `steps`
- `decision_rules`
- `output`
- selector metadata with context types and positive or negative signals
- execution metadata with ordered operations
- decision metadata with ordered evidence rules and fallback behavior
- response wording for root cause, alternative hypotheses, and next actions
- confirmed-fact templates for report rendering

## Anti-Patterns

- steps that instruct the model to "think harder"
- conclusions without evidence types
- hidden business assumptions in generic runbooks
- selection logic hardcoded in code but absent from runbook metadata
- execution order hardcoded in code but absent from runbook metadata
- decision logic hardcoded in code but absent from runbook metadata
- response wording hardcoded in code but absent from runbook metadata
- confirmed-fact rendering hardcoded in code but absent from runbook metadata
- write operations in the MVP
