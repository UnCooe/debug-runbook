# Tool Adapter Spec

## Purpose

Adapters expose backend observability capabilities through stable, safe contracts.

They should hide vendor-specific details from the runbook layer as much as possible.

## Common Requirements

Every adapter should define:

- input schema
- output schema
- auth and access boundary
- timeout
- result limits
- masking rules
- audit fields

## Common Output Shape

Each adapter response should include:

- `ok`: whether the call succeeded
- `source`: adapter name
- `query`: normalized input
- `summary`: short response summary
- `evidence`: zero or more normalized evidence items
- `raw_ref`: pointer to the raw source payload
- `errors`: normalized error list

## Normalization Metadata

In the current MVP, raw adapter responses are converted into evidence through metadata files rather than hardcoded switch statements.

Examples:

- `adapters/trace/trace.lookup.normalization.json`
- `adapters/trace/trace.inspect_spans.normalization.json`
- `adapters/db/db.readonly_query.normalization.json`
- `adapters/db/db.lookup_entity.normalization.json`
- `adapters/redis/redis.inspect.normalization.json`

This layer is separate from runbook logic.

Reason:

- adapters decide how raw source payloads become normalized evidence
- runbooks decide how normalized evidence should be interpreted

## Derived Evidence Policies

Cross-source evidence should also be externalized when possible.

In the current MVP, derived evidence lives in:

- `evidence-policies/derived-evidence.json`

Example use case:

- compare Redis status with DB status
- emit `status_mismatch` when they conflict

## Trace Adapter

Responsibilities:

- locate traces by supported locator types
- summarize critical spans
- surface errors, status, duration, and missing stages

Suggested operations:

- `trace.lookup`
- `trace.inspect_spans`
- `trace.get_errors`

## DB Readonly Adapter

Responsibilities:

- support predefined readonly queries or templated lookups
- prevent broad or unsafe SQL
- return normalized existence and state evidence

Suggested operations:

- `db.readonly_query`
- `db.lookup_entity`

## Redis Adapter

Responsibilities:

- inspect keys, ttl, and small value snapshots
- avoid heavy scans in production
- normalize cache existence and freshness signals

Suggested operations:

- `redis.inspect`
- `redis.ttl`

## Non-Goals For MVP

- arbitrary shell execution
- unrestricted SQL
- write or repair actions
- full raw payload injection into the model without filtering
