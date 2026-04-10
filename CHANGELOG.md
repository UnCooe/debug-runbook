# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-04-07

### Added

- initial public MVP release of `agent-debugger`
- zero-config replay demo via `pnpm demo`
- release checklist, release notes draft, and release announcement draft
- runtime support for loading custom runbooks from `runbooks:` config entries
- tests covering config interpolation, custom runbook loading, and context-specific runbook execution

### Changed

- rewrote the README around a recognizable incident pattern instead of abstract architecture-first positioning
- separated the zero-config demo path from real-system setup
- narrowed built-in runbook context coverage to the locator types currently backed by fixtures and runtime mappings
- added runtime validation for unsupported `context_type` / runbook combinations
- tightened package metadata with Node version requirements, release-facing file whitelisting, and repository links

### Fixed

- config interpolation now preserves unresolved environment placeholders instead of corrupting the full string
- relative paths in `runbooks:` config entries now resolve relative to the config file location
- published tarball no longer includes coverage artifacts or compiled test files
