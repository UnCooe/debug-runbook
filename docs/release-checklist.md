# Release Checklist

## Scope

This checklist is for an honest `v0.1.0` open-source MVP release.

Release framing should stay within these claims:

- replayable incident investigation framework
- runbook-driven evidence collection
- benchmarkable selection and conclusion flow
- MCP entrypoint for investigation tooling

Do not frame this release as:

- a complete production self-healing platform
- the original internal DAG system
- unrestricted automatic repair

## Product Readiness

- README starts with a recognizable incident pattern, not architecture jargon.
- Zero-config demo works from a clean clone.
- Real-system setup is clearly separate from the zero-config path.
- Repository limitations are stated explicitly.

## Runtime Readiness

- `pnpm test -- --run` passes.
- `pnpm build` passes.
- `pnpm check` passes.
- `pnpm benchmark` passes.
- `pnpm demo` prints a full structured walkthrough.
- Built-in runbook context support matches runtime parameter mappings.

## Package Readiness

- `npm pack --dry-run` contains only the intended release files.
- `package.json` declares the minimum supported Node.js version.
- `package.json` includes `repository`, `homepage`, and `bugs` metadata.
- `prepack` builds fresh artifacts.
- `dist/` does not contain compiled test files.

## Docs Readiness

- Config examples use the same key prefixes and context assumptions as the built-in runbooks.
- Custom runbook support is documented with sibling metadata requirements.
- Runbook spec documents context-specific step params where applicable.
- `CHANGELOG.md` summarizes the release scope and major fixes.
- `SECURITY.md` defines a private reporting path and scope notes.

## Final Release Pass

- Choose the release title and wording for an MVP, not a production platform.
- Prepare the release announcement from the current repository scope.
- Tag only after the checklist above is green.
