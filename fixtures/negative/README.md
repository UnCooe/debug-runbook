# Negative Samples

This directory contains intentionally broken samples used to demonstrate that the repository check can catch drift and invalid metadata.

These files are not part of the normal benchmark or demo flow.

Cases:

- `missing-normalization`: execution metadata references an operation with no normalization file
- `unknown-finding-type`: decision metadata references a finding type that no adapter or evidence policy emits
- `unknown-runbook`: a fixture manifest references a runbook that does not exist
