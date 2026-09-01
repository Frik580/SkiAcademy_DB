## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Canonical migration UX

During canonical migration, preserve existing useful UX and product
capabilities. Never delete or materially simplify an existing UX
merely because its implementation is legacy. Inspect Git history when
parity is uncertain. Ask the product owner in Russian before making an
unapproved UX/product change.

Authoritative policy: [ADR-0008](docs/adr/0008-ux-preservation-during-canonical-migration.md).
A slice is not complete without UX capability parity.

## Feature boundaries

- Keep full domain models (`Booking`, `UserProfile`, `Course`, and similar) in containers, services, and domain workflows. A child UI component may receive a full model only when it genuinely renders or edits most of that model.
- Treat page/home/shell components as containers. They may fetch data, call stores and services, assemble view models, and resolve IDs back to full entities before opening a modal or mutation flow.
- Treat reusable cards, rows, cells, sections, and dialogs as presentational boundaries. Give them a feature-specific `*Input` contract or a prepared view model containing only the fields and callbacks they need.
- Do not create or extend a broad shared UI context/props interface for convenience. Add a focused contract per panel or component family; prefer `Pick<FeatureContext, ...>` only inside the contracts module, never in a component declaration.
- Keep feature contracts beside the feature (for example, `studentCabinetContracts.ts` and `scheduleContracts.ts`). Domain-model imports belong in that contracts module, not in new presentational children.
- Pass IDs and narrow callbacks across component boundaries when a child only needs to open, delete, move, or select an entity. Resolve the full object in the container.
- Access localization from feature-level translation hooks (for example, `useStudentCabinetTranslations` and `useScheduleTranslations`) rather than importing `useLanguage()` directly in new child components.
- Keep domain calculations, sorting, filtering, and formatting outside JSX in feature/domain helpers. Components should compose results rather than reimplement rules inline.
- When adding a new component, check whether it adds a direct edge to `useLanguage()`, `Booking`, `UserProfile`, or `Course`; use an existing feature boundary unless the direct dependency is justified by the component's responsibility.
- Refactor existing code to these boundaries only when the file is being changed or its coupling creates a concrete maintenance problem.

## Agent skills

### Issue tracker

Issues and specs are tracked using this repository's configured issue workflow.
See `docs/agents/issue-tracker.md`.

When GitHub Issues are unavailable, use the approved issue-ready artifacts in
`.scratch/canonical-booking-domain-rewrite/issues/` as the implementation-ticket source.

### Domain docs

Single-context layout: one root `CONTEXT.md` and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Review policy

For implementation tickets, use one independent code-review pass by default.

Do not launch multiple parallel reviewers unless the ticket explicitly involves:
- financial accounting;
- transaction/concurrency infrastructure;
- security Rules;
- destructive reset/cutover behavior.

Implementation-time tests, typecheck, lint, build, and self-checks do not count as separate code reviews.

If the first review finds substantial issues and fixes are applied, rerun targeted checks and review only the changed/risky areas instead of launching another full parallel review.
