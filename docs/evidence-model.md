# Evidence Model

## Why It Matters

The evidence model is a critical variable.

If the framework only exposes traces, SQL, and Redis results directly to the model, it becomes "LLM with tools". The real value appears when those outputs are normalized into evidence objects with stable semantics.

## Evidence Object

Each evidence item should follow a normalized schema.

Required fields:

- `id`: unique evidence identifier
- `source`: adapter source, such as `trace`, `db`, `redis`
- `entity_id`: business or technical entity this evidence refers to
- `timestamp`: time the evidence was observed or fetched
- `finding_type`: semantic category of the finding
- `summary`: short fact statement
- `confidence`: confidence in normalization, not root-cause certainty
- `raw_ref`: stable pointer to the underlying raw payload or query result

Recommended fields:

- `query`: the query or lookup input used to fetch the evidence
- `service`: related service name
- `span_id`: related span when source is trace
- `table`: related table when source is db
- `key`: related key when source is redis
- `severity`: informational, warning, error
- `normalization_status`: complete, partial, ambiguous
- `tags`: domain-specific labels

## Finding Types

The framework should not let every adapter invent its own wording. Start with a small taxonomy:

- `trace_found`
- `trace_missing`
- `span_missing`
- `status_mismatch`
- `db_row_found`
- `db_row_missing`
- `cache_key_exists`
- `cache_key_missing`
- `cache_ttl_positive`
- `downstream_error`
- `message_not_delivered`

## Evidence Requirements

Runbooks should declare minimum evidence requirements for conclusions.

Examples:

- "request reached service" requires `trace_found` or a log/dependency equivalent
- "expected row missing" requires a `db_row_missing` item with explicit query reference
- "stale cache suspected" should require at least one cache item plus one contradictory source

## Conflicting Evidence

The model must not flatten conflicts.

When evidence conflicts, the report should:

1. mark the conflict explicitly
2. preserve both evidence items
3. downgrade confidence
4. recommend the next best discriminating check

## Time Semantics

Evidence should be interpreted relative to the incident window.

Important cases:

- delayed async systems can create misleading "missing" conclusions
- stale cache observations may be true now but irrelevant at incident time
- trace timestamps and database commit timestamps may differ

The evidence object should therefore carry timestamps and, when possible, collection time versus event time.
