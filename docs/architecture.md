# Architecture

## Goal

The framework converts backend troubleshooting into a constrained execution loop:

1. accept incident context
2. select a runbook
3. collect normalized evidence through adapters
4. evaluate decision rules
5. emit a structured report

## System Layers

### Incident Input Layer

Accepts an identifier plus user-facing symptom description.

Typical context locators:

- `trace_id`
- `request_id`
- `order_id`
- `task_id`
- `message_id`

Important constraint: the framework should not depend on `trace_id` as the only entrypoint. In real systems, traces may be sampled, missing, or incomplete for async flows.

### Adapter Layer

Adapters expose observability systems through stable read-only contracts.

Typical adapters:

- trace
- db readonly
- redis inspect
- mq inspect
- log search
- dependency call lookup

Adapters are responsible for:

- request validation
- access control
- source-specific normalization
- raw payload reference generation

### Evidence Layer

The evidence layer turns raw adapter output into a common shape that the agent can reason over.

Without this layer, the project becomes a tool bundle rather than a debugging framework.

### Runbook Layer

Runbooks define:

- prerequisites
- execution steps
- branch conditions
- minimum evidence requirements
- output expectations

Runbooks should constrain investigation order, not fully replace model reasoning.

### Report Layer

The output should be a structured incident report with:

- observed symptom
- confirmed facts
- likely root cause
- alternative hypotheses
- evidence references
- recommended next actions

## Execution Model

Recommended loop:

1. Validate the incident input
2. Choose the best matching runbook
3. Execute required steps in order
4. Normalize every tool result into evidence items
5. Evaluate decision rules
6. Stop when confidence threshold or runbook terminal state is reached
7. Produce incident report

## Design Constraints

### Read-only by default

No adapter should mutate state in the MVP.

### Deterministic enough to audit

The agent can summarize and rank hypotheses, but the collection path should be largely inspectable and repeatable.

### Bounded exploration

Runbooks should declare tool and step limits to avoid unbounded searching.

### Safety-aware by design

Adapters should support masking, allowlists, and query budgets.
