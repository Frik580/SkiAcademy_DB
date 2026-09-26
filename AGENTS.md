# Carve Academy — Agent Instructions

This file is the universal repository instruction set for Codex, Cursor, and other coding agents.

`.cursor/rules/*.mdc` may provide more detailed Cursor-specific guidance, but this file must remain sufficient for safe work even when those rules are unavailable.

Work narrowly, preserve canonical architecture and product capability parity, and prefer the smallest correct change.

---

## 1. Graphify

This project has a knowledge graph under `graphify-out/` with cross-file relationships and architecture metadata.

When the user explicitly types `/graphify`, use the installed Graphify skill/instructions before doing anything else.

For codebase investigation:

- When `graphify-out/graph.json` exists, prefer `graphify query "<question>"` before broad source browsing.
- Use `graphify path "<A>" "<B>"` for dependency and reachability questions.
- Use `graphify explain "<concept>"` for focused concept inspection.
- Prefer scoped Graphify output over reading `GRAPH_REPORT.md` or performing broad raw grep scans.
- Dirty `graphify-out/` files are expected after hooks or incremental updates and are not a reason to skip Graphify.
- Skip Graphify only when:
  - the task is specifically about stale/incorrect graph output; or
  - the user explicitly says not to use it.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation before reading large source areas.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when `query/path/explain` are insufficient.
- Always verify Graphify findings against the current source code before making changes, because the graph may lag behind recent commits.

After modifying source code:

- run `graphify update .` once near the end when the task changes architecture, dependencies, authorization, canonical domain behavior, read models, Cloud Functions, Firestore/Storage access, data flow, or cross-file relationships;
- for purely local presentation changes such as copy, styling, or isolated visual tweaks where code relationships do not materially change, Graphify refresh is optional;
- if `graphify update .` cannot run because Graphify CLI/Python is unavailable or misconfigured, do not block the task: report `GRAPHIFY UPDATE: BLOCKED`, explain the exact reason, and continue using the current source code as the authority;
- when the CLI is unavailable but `graphify-out/graph.json` exists, it may be used only as navigation assistance and must not be treated as fresher or more authoritative than the current source tree;
- do not repeatedly run expensive Graphify updates during implementation;
- graph freshness is secondary to product correctness;
- do not modify product code merely to satisfy graph shape.

Use Graphify to narrow investigation, not to broaden task scope.

---

## 2. Token-efficient workflow

Work narrowly by default.

For every task:

- start from the exact files, symbols, errors, screenshots, diff, or feature area named by the user;
- find the smallest relevant execution path first;
- read only files required to understand or modify that path;
- do not perform broad repository audits unless the task genuinely requires one;
- do not inspect unrelated domains "just in case";
- expand scope only when a concrete dependency, invariant, failing test, or ambiguity requires it.

Prefer:

`task → relevant symbol/search → execution path → minimal files → change`

Avoid:

`task → scan repository → read architecture/docs → inspect unrelated code → change`

Reuse context:

- do not re-read unchanged files unless a new dependency or failure requires it;
- do not repeat searches that already established the answer;
- do not regenerate architectural explanations already established in the current task/session;
- prefer targeted symbol/search operations over reading large files end-to-end;
- if another agent already implemented part of the task, inspect the current diff and continue from it rather than restarting.

Stop exploring when all of the following are known:

- root cause or required change;
- relevant execution path;
- affected invariant;
- files to change;
- appropriate validation.

Do not continue repository exploration merely for extra confidence.

---

## 3. Takeover / existing WIP

When continuing work started by another agent or the user:

1. run `git status --short`;
2. run `git diff --stat`;
3. inspect the relevant diff;
4. classify existing work as:
   - `DONE`
   - `PARTIAL`
   - `MISSING`
   - `BROKEN`
5. modify only `PARTIAL / MISSING / BROKEN`.

Do not rewrite `DONE` work merely because you would implement it differently.

Preserve unrelated working-tree changes.

---

## 4. Documentation discipline

Do not automatically read large project documentation.

Read ADRs, migration docs, audit docs, `CONTEXT.md`, or similar material only when:

- the task touches the contract documented there;
- a canonical/domain invariant is unclear;
- implementation conflicts with documentation;
- the user explicitly asks for documentation validation;
- roadmap/status closure depends on the accepted documented state.

When documentation is needed:

- read only the relevant section when possible;
- update only documents whose accepted contract/status changed;
- do not rewrite unrelated historical sections.

Single-context layout:

- root `CONTEXT.md`
- ADRs in `docs/adr/`

See `docs/agents/domain.md` when domain-document workflow is relevant.

---

## 5. Canonical migration UX

During canonical migration, preserve existing useful UX and product capabilities.

Never delete or materially simplify an existing UX merely because its implementation is legacy.

When parity is uncertain:

- inspect current code/tests;
- inspect Git history when needed;
- ask the product owner in Russian before making an unapproved UX/product change.

Authoritative policy:

`docs/adr/0008-ux-preservation-during-canonical-migration.md`

A migration slice is not complete without product/UX capability parity.

Preserve the distinction:

`LEGACY IMPLEMENTATION != LEGACY FEATURE`

A legacy implementation may be removed only after the useful capability has a working canonical replacement.

---

## 6. Canonical domain safety

Apply these rules whenever the task touches:

- Participant/account identity;
- avatars;
- Lesson Booking;
- CourseEnrollment;
- Attendance;
- Wallet / Payment / MonetaryEvent;
- canonical commands;
- read models;
- Firestore;
- Cloud Functions;
- related product state.

Before changing domain behavior:

- identify the current source of truth;
- identify the current mutation/read path;
- identify the affected invariant;
- identify the authorization boundary;
- verify exact collection names, field names, command names, callable names, and storage paths in current code.

Do not introduce:

- a second source of truth;
- duplicate persistence paths;
- direct client persistence where a canonical command exists;
- new legacy writes;
- new legacy fallbacks;
- client-authoritative payment behavior;
- client-authoritative Attendance behavior.

### Participant / account identity

`Participant` is the canonical person identity.

For the self Participant:

- self identity and account/client identity must stay aligned;
- editable personal identity belongs in the Participants flow;
- mirrored account/UserProfile fields are projections/compatibility data, not an independent editable authority.

For dependent Participants:

- identity is independent from the account owner;
- changing one dependent must not mutate another Participant.

Do not reintroduce duplicate personal-data editing flows.

### Avatars

Each Participant may have an independent avatar.

- self Participant avatar may also represent account/client identity where required by UI;
- dependent avatars remain independent;
- updating one Participant avatar must not update another Participant.

Respect current ownership/authorization and Storage rules.

### Lesson Booking

Canonical Lesson Booking may support multiple Participants through the current canonical party/ID contract.

For a multi-participant lesson:

- one canonical Booking represents the lesson;
- one slot/resource reservation;
- one payment operation;
- cancellation follows the Booking as a whole unless the current canonical contract explicitly says otherwise.

Do not create one Booking per Participant as a workaround.

Additional-participant pricing is configuration/domain data, not a hard-coded UI constant.

### CourseEnrollment

CourseEnrollment is participant-scoped.

- do not infer Lesson Booking multi-participant semantics onto CourseEnrollment;
- enrollment checks must be evaluated for the relevant Participant;
- progress, Attendance, completion, achievements, and UI state must remain Participant-scoped;
- different Participants on the same Course have distinct Enrollments.

### Wallet / money

The canonical product currency is KZT.

For money-affecting operations:

- preserve transactionality;
- preserve idempotency;
- prevent duplicate debit/credit;
- keep Payment / MonetaryEvent / canonical Wallet server-authoritative;
- distinguish a newly-created monetary operation from an already-existing idempotent result when the current contract does so.

Do not introduce new USD-based product behavior or new legacy balance writes.

### Attendance

Attendance is participant-scoped factual evidence.

- do not invent `present` or `absent` merely because time passed;
- missing Attendance means factual status is unknown;
- preserve current deadline/escalation/AdminIssue behavior;
- verify exact deadline/window semantics from code/tests before modifying them.

### Read models

Read models are projections/query surfaces, not alternate authorities.

When changing a read model:

- preserve authorization scope;
- preserve Participant/Account scoping;
- preserve canonical mutation semantics;
- avoid unnecessary polling and broad reads;
- keep optimization separate from mutation authority.

---

## 7. Feature boundaries

- Keep full domain models (`Booking`, `UserProfile`, `Course`, and similar) in containers, services, and domain workflows.
- A child UI component may receive a full model only when it genuinely renders or edits most of that model.
- Treat page/home/shell components as containers.
- Containers may fetch data, call stores/services, assemble view models, and resolve IDs back to full entities before modal/mutation flows.
- Treat reusable cards, rows, cells, sections, and dialogs as presentational boundaries.
- Give presentational components a feature-specific `*Input` contract or prepared view model containing only fields/callbacks they need.
- Do not create or extend broad shared UI context/props interfaces merely for convenience.
- Add focused contracts per panel/component family.
- Prefer `Pick<FeatureContext, ...>` only inside contract modules, not component declarations.
- Keep feature contracts beside the feature, for example:
  - `studentCabinetContracts.ts`
  - `scheduleContracts.ts`
- Domain-model imports belong in contracts/domain layers, not new presentational children.
- Pass IDs and narrow callbacks across component boundaries when the child only needs to open/delete/move/select an entity.
- Resolve full entities in the container.
- Access localization through feature-level translation hooks rather than importing `useLanguage()` directly into new child components.
- Keep domain calculations, sorting, filtering, and formatting outside JSX in feature/domain helpers.
- Refactor existing code to these boundaries only when:
  - the file is already being changed; or
  - its coupling creates a concrete maintenance problem.

---

## 8. Server resource efficiency

Server-resource efficiency is a project-wide non-functional requirement.

Actively avoid:

- unbounded reads;
- N+1 queries;
- duplicate subscriptions;
- unnecessary eager hydration;
- full-history polling;
- background jobs whose no-op cost grows with historical data.

Prefer:

- bounded server-side queries;
- cursor pagination;
- lazy loading;
- shared read ownership;
- surface/Participant-scoped reads;
- small no-op scheduler cost.

Never trade away:

- correctness;
- security;
- canonical contracts;
- lifecycle;
- payments;
- Attendance;
- authorization;
- idempotency;
- user-facing UX

merely to reduce resource use.

Do not broaden a ticket into a major optimization refactor without explicit approval.

Flag unrelated optimization opportunities instead.

When Firestore/read cost materially changes, report:

- query shape;
- page/batch bound;
- polling/scheduler frequency when relevant;
- whether a full scan/drain exists.

Do not invent speculative cost numbers.

Detailed Cursor-specific rule, when available:

`.cursor/rules/server-resource-efficiency.mdc`

---

## 9. Minimal implementation

Make the smallest coherent change that fixes the task.

Avoid unless required:

- unrelated cleanup;
- renaming unrelated symbols;
- formatting unrelated files;
- speculative abstraction;
- new helper layers;
- rewriting working code;
- updating unrelated documentation.

If you discover an unrelated issue, mention it briefly instead of fixing it automatically.

If a task is explicitly a destructive-cleanup slice:

- follow the approved manifest exactly;
- do not expand destructive scope merely because additional dead code is discovered.

---

## 10. Testing pyramid

After a change, start with the narrowest relevant validation.

Default order:

1. directly affected unit tests;
2. feature/domain tests;
3. emulator/integration tests only when changed behavior requires them;
4. typecheck/build when relevant;
5. full suite only when justified.

Do not run the entire test suite after every change.

Run broad/full validation when:

- the user explicitly requests it;
- shared/canonical infrastructure changed;
- the change has meaningful cross-domain impact;
- targeted failures indicate a wider regression;
- this is a final integration/release/merge gate.

A UI-only change normally does not require unrelated backend/emulator/E2E suites.

When emulator assertions pass but a wrapper later reports a shutdown/process error, report separately:

- assertion/test result;
- wrapper/process result.

Implementation-time tests, typecheck, lint, build, and self-checks do not count as an independent code-review pass.

---

## 11. Browser/runtime verification

Do not open protected/authenticated application routes unless an authenticated session is available.

If auth is unavailable:

- use targeted unit/integration/emulator tests;
- use typecheck/build when relevant;
- when runtime verification matters, explicitly report:

`AUTHENTICATED WORKFLOW: NOT VERIFIED`

Do not treat redirect-to-login as workflow verification.

Pure backend/domain changes normally do not require browser verification.

---

## 12. Terminal/tool output

Keep tool output compact.

For successful commands:

- retain/report only the useful summary.

For failures:

- inspect the failing test/error and only necessary surrounding context.

Do not dump:

- thousands of passing test lines;
- complete Firebase logs when one error matters;
- full repository diffs when only several files changed;
- unrelated build output.

Prefer targeted/filtered commands.

---

## 13. Diff inspection

Before finishing:

- verify intended files changed;
- inspect `git status --short`;
- inspect the relevant diff;
- check for accidental unrelated edits;
- verify required targeted tests;
- run `git diff --check` when code/docs changed.

Do not repeatedly inspect the same unchanged diff.

---

## 14. Git safety

Do not commit unless the user asks.

Before staging/committing:

- inspect `git status --short`;
- keep unrelated WIP untouched;
- never use `git add .` by default;
- stage exact task files;
- inspect `git diff --cached`;
- keep logically separate slices in separate commits when practical.

Do not:

- reset unrelated user work;
- clean unrelated user work;
- checkout over unrelated user work;
- overwrite unrelated WIP.

---

## 15. Deployment discipline

Do not deploy unless the user explicitly asks.

When a task may affect deployed infrastructure, derive deployment scope from the actual final diff and dependency graph.

Do not guess.

Report exact impact:

- Functions — exact names or `NO`;
- Hosting — `YES/NO`;
- Firestore Rules — `YES/NO`;
- Firestore Indexes — `YES/NO`;
- Migration/Data migration — `YES/NO`;
- Settings/manual setup — `YES/NO`;
- Schedulers/triggers — exact names or `NO`.

If indexes are required:

1. deploy indexes;
2. wait for required indexes to become READY/Enabled;
3. deploy Functions that depend on them;
4. deploy Rules/Hosting in dependency-safe order.

If shared Functions source/dependencies make partial deploy unsafe, say so instead of mechanically listing a subset.

When deploy commands are requested, provide exact commands for the current shell/project.

Production Firebase project:

`ski-school-8f3ca`

Do not perform broad `firebase deploy` when a narrower safe deploy is available.

For PowerShell, quote Functions selectors where appropriate.

---

## 16. Policy ambiguity

Do not guess business/product policy.

If implementation requires a new decision about:

- lifecycle;
- authorization;
- money;
- ownership;
- migration;
- destructive cleanup;
- product/UX semantics;
- canonical source of truth;

stop implementation at that boundary and ask one concise question in Russian.

Do not make a silent product decision.

---

## 17. Legacy and migration discipline

Do not add new dependencies on legacy fields, collections, callables, or flows.

If legacy compatibility remains:

- preserve it only when the current task requires it;
- do not expand it;
- do not delete it unless the task explicitly includes migration/removal and required gates are satisfied.

Historical data is not automatically safe to delete merely because its implementation is legacy.

For migration gates, distinguish:

- source reachability;
- deployed/production reachability;
- historical data retention;
- compatibility fields/projections;
- destructive cleanup.

Never infer production absence solely from source export absence.

For cleanup tasks, classify findings explicitly when useful:

- ACTIVE_WRITE
- ACTIVE_AUTHORITY_READ
- ACTIVE_FALLBACK
- DUAL_WRITE
- PRESENTATION_ONLY
- TEST_ONLY
- DEAD
- ALREADY_CONTAINED

Do not convert an audit/rehearsal task into destructive cleanup unless that cleanup was explicitly approved.

---

## 18. Long-running processes

Do not start unnecessary long-running processes.

When a long-running command is required:

- prefer the existing project workflow;
- avoid starting duplicate dev servers, emulators, Graphify processes, or watchers;
- check whether an appropriate process is already running;
- terminate only processes started for the current task unless explicitly authorized otherwise.

Do not leave unnecessary background processes running after the task.

Cursor-specific details may exist in:

`.cursor/rules/long-running-processes.mdc`

---

## 19. Agent skills

### Issue tracker

Issues and specs are tracked using this repository's configured issue workflow.

See:

`docs/agents/issue-tracker.md`

When GitHub Issues are unavailable, use approved issue-ready artifacts in:

`.scratch/canonical-booking-domain-rewrite/issues/`

as the implementation-ticket source.

### Domain docs

See:

`docs/agents/domain.md`

### Stitch

Google Stitch is used for UI exploration and variant generation.

See:

`docs/agents/stitch.md`

Configuration:

- MCP server: `stitch` via `.cursor/stitch-mcp-proxy.mjs`
- requires `STITCH_API_KEY`
- Project ID: `12447626312814512672`
- Design system: `assets/11762622741281556178`
- Design tokens:
  - `docs/design/alpine-air.DESIGN.md`
  - `src/index.css`
- Screen registry:
  - `.stitch/metadata.json`

Use Stitch only when the task actually involves UI exploration/design.

Do not load Stitch context for unrelated backend/domain work.

---

## 20. Review policy

For implementation tickets, use one independent code-review pass by default.

Do not launch multiple parallel reviewers unless the ticket explicitly involves:

- financial accounting;
- transaction/concurrency infrastructure;
- security Rules;
- destructive reset/cutover behavior.

If the first review finds substantial issues and fixes are applied:

- rerun targeted checks;
- review only changed/risky areas instead of starting another full parallel review.

---

## 21. Final response

Keep final reports concise.

Default structure:

### Verdict
`DONE | PARTIAL | BLOCKED | READY_FOR_NEXT_SLICE`

### Changed
Only actual changed files/areas.

### Validation
Only meaningful checks with:

`PASS | FAIL | NOT RUN`

### Server impact
Include when deployed infrastructure may be affected:

- Functions:
- Hosting:
- Rules:
- Indexes:
- Migration:
- Settings:
- Schedulers:

### Remaining risk
Only real unresolved risks.

### Next
Only the concrete accepted next step.

Do not repeat:

- the full task description;
- architecture that did not change;
- long implementation narratives;
- successful test logs;
- unchanged invariants.

For a straightforward task, keep the final report short.