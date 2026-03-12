# Evaluation

## Why Evaluation Is Required

A debugging framework without evaluation is hard to trust.

The project should prove that runbooks and evidence normalization improve investigation quality, not just produce nicer reports.

## Minimum Benchmark

The first benchmark can stay small.

Recommended setup:

- 3 to 5 replayable incident cases
- each case has a known root cause
- each case includes mock trace, db, and redis data
- each case defines expected findings and acceptable final conclusions

## Compare Three Modes

### Mode 1: Raw-tools agent

The model receives tool access but no runbook and no normalized evidence layer.

### Mode 2: Runbook-driven agent

The model receives the same tools plus runbook constraints and evidence schema.

### Mode 3: Human checklist baseline

A deterministic checklist or operator guide is used without model reasoning.

## Suggested Metrics

- root-cause accuracy
- evidence completeness
- unsupported-claim rate
- average tool calls per case
- time to first plausible diagnosis
- final report usefulness score

## Failure Analysis

Evaluation should also classify failure modes:

- wrong runbook selection
- insufficient evidence collected
- evidence conflict ignored
- tool misuse
- overconfident conclusion

## Acceptance Bar For MVP

The MVP does not need perfect automation. A reasonable acceptance bar is:

- lower unsupported-claim rate than raw-tools mode
- equal or better root-cause accuracy on simple cases
- clearly better report structure and evidence traceability
