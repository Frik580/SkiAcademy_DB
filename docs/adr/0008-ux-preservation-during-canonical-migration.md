---
status: accepted
date: 2026-09-01
---

# ADR-0008: UX Preservation During Canonical Migration

Canonical migration is an implementation, domain, and security migration. It is
not permission to redesign, simplify, remove, or replace existing product UX.

This ADR is the authoritative **UX Preservation Contract** for the entire
application, including Admin Panel, Student Cabinet, Instructor UI, Lesson
Booking, Course / CourseEnrollment, Schedule / Planner, Finance, Attendance,
Profile / People, History, Guest flows, and every other existing user-facing
workflow. It applies to T32, T33, and later slices.

It does not change accepted domain, security, or topology decisions in
[CONTEXT.md](../../CONTEXT.md) or [ADR-0001](./0001-canonical-aggregate-topology.md)
through [ADR-0007](./0007-guest-identity-payment-and-confirmation.md).

## UX PRESERVATION CONTRACT

Canonical migration must preserve existing useful product UX, information,
interactions, and capabilities unless the product owner explicitly approves a
UX change.

The migration may replace:

- backend implementation
- data source
- Firestore access
- direct writes
- domain services
- canonical commands
- read models
- schemas
- authorization
- internal data topology
- security boundaries

It must **not** silently remove or materially degrade:

- screens
- navigation
- tabs
- forms
- tables
- cards
- filters
- search
- modals
- detail views
- displayed useful information
- workflows
- interactive behavior
- drag and drop
- actions
- monitoring views
- management capabilities

This ADR records the reusable rule. It does not inventory every current control.
Slice-specific Admin capabilities belong in T32.9A documentation, not here.

## LEGACY IMPLEMENTATION != LEGACY FEATURE

A component, service, Firestore query, or mutation being legacy does not imply
that the product capability it provides is obsolete.

Correct migration pattern:

```text
identify historical/current product capability
        ↓
preserve the UX and useful information
        ↓
replace legacy data source with canonical read model
        ↓
replace legacy mutation with canonical command
        ↓
add new canonical information/actions where needed
        ↓
prove feature parity
        ↓
only then remove legacy implementation
```

Explicitly prohibited unless the product owner has approved the UX reduction:

```text
legacy backend found
→ delete screen
→ replace with reduced canonical UI
```

## Historical UX is valid migration evidence

Git history may be used to recover product capabilities lost during migration.

When current UI has already been simplified or removed, inspect Git history plus
historical screenshots, tests, and components to determine:

- what information was shown;
- what filters existed;
- what actions existed;
- what interactive behavior existed;
- what workflow the user previously had.

Do **not** blindly revert old implementation. Restore the product capability on
top of current canonical architecture.

## New canonical UX may be additive

New canonical functionality may require new forms, dialogs, status chips,
panels, detail sections, selectors, diagnostics, AdminIssue actions, Payment
information, and Account / Participant topology. That is allowed.

The target is:

```text
EXISTING USEFUL UX
+ NEW CANONICAL CAPABILITIES
= TARGET UX
```

not:

```text
NEW CANONICAL UX
replaces
EXISTING USEFUL UX
```

unless the product owner explicitly approved the replacement.

Accepted product-policy supersessions still apply. UX preservation does not
restore rejected semantics. For example, unpaid Administrator guest approval is
obsolete under [ADR-0007](./0007-guest-identity-payment-and-confirmation.md) and
must not be revived as “historical UX.”

## Apply the rule to all roles

### Administrator

Existing Admin screens, information density, planner, finance, People
management, monitoring, filtering, and operational functionality must be
preserved or restored.

### Student

Existing booking, course, cabinet, profile, payment, progress, and other useful
flows must not disappear merely because their backend is migrated.

### Instructor

Existing schedule, roster, attendance, participant/service information, and
operational workflows must be preserved unless explicitly changed.

### Guest

Existing guest booking/enrollment flows and useful feedback must remain
understandable while canonical identity and payment behavior change underneath.

## Feature parity is part of migration acceptance

A migration slice is not fully complete merely because code compiles, tests
pass, a canonical backend exists, or a legacy write is gone.

Required acceptance dimensions:

```text
domain correctness      PASS
security/authority      PASS
data/runtime migration  PASS
regression tests        PASS
UX capability parity    PASS
```

If an existing useful capability disappeared or materially degraded:

```text
UX parity = FAIL/PARTIAL
```

and the slice must not be treated as fully finished from the product-migration
perspective.

This criterion applies globally, including future T33 work.

## UX parity inventory before destructive cleanup

Before removing a historical frontend or runtime implementation, record evidence
such as:

| Feature / capability | Role(s) | Current UX | Current dependency | Canonical/approved replacement | Information parity | Action parity | Interaction parity | Status | Safe to remove legacy? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Valid status values:

- `PASS`
- `PARTIAL`
- `MISSING`
- `NEEDS_PRODUCT_DECISION`

A legacy implementation must not be removed while the capability is `PARTIAL`,
`MISSING`, or `NEEDS_PRODUCT_DECISION`, unless the product owner explicitly
authorizes removal. T32.9A.9D is likewise forbidden while 9P has any in-scope row in those states, except an explicit Product Owner decision.

## Mandatory product clarification

If canonical correctness appears to require removing an existing feature,
simplifying an existing screen, removing displayed information, changing
workflow behavior, changing filters, replacing interactive UX with a less
capable representation, or changing product semantics, and that change is not
already established by an accepted product decision:

**STOP and ask the product owner.**

For AI agents, ask in Russian.

Before asking, inspect current code, tests, Git history, ADRs, specs, and
Graphify. Do not ask if repository evidence already resolves the question. Do
not invent policy.

## UX preservation is not legacy-authority preservation

Preserving UX does **not** mean preserving insecure or legacy authority.

Examples:

```text
old planner UI          → may be restored
old planner updateDoc() → must NOT be restored

old client table        → may be restored
direct role mutation    → must NOT be restored

old finance view        → may be restored
raw Wallet mutation     → must NOT be restored
```

Preferred architecture:

```text
preserved/restored UI
        ↓
canonical read model
        ↓
canonical command
        ↓
server authorization
        ↓
canonical transaction
```

## T32.9 boundary

### T32.9A — Admin UX Restoration & Canonical Integration

Purpose:

- recover missing historical Admin UX;
- preserve useful information and interactions;
- integrate new canonical functionality;
- prove feature parity;
- identify legacy implementations safe for later removal;
- complete FINAL CANONICAL CUTOVER under T32.9A.9 (9A–9E, including 9P
  and 9D0).

T32.9A is **not** broad legacy UI cleanup.

Current T32.9A structure (status details live in
[T32_CANONICAL_ADMIN_AUDIT.md](../T32_CANONICAL_ADMIN_AUDIT.md)):

```text
T32.9A.8 — Canonical Courses UX
  8A / 8B / 8C — PASS / CLOSED

T32.9A.9 — FINAL CANONICAL CUTOVER
  9A — Individual Booking lifecycle cutover
       (core
        → F1 Admin Guest Payment Capture
        → F2 Guest Unpaid Reservation Expiry
        → F3 Canonical Multi-Participant Lesson Booking
        → final integration / production smoke)
  9B — Student Booking Stats / Progress / Recommendations Cutover
       (includes Reviews / Instructor Rating Continuity)
  9C — Course Progress / Achievements Cutover
  9P — Global Product Parity & legacy Dependency Gate
  9D0 — Production-like Incremental Cutover Rehearsal
  9D — Selective Destructive legacy Data Cleanup
  9E — Canonical Authority / Reachability Gate
THEN
T32.9B — Final legacy Runtime Cleanup
T40 — Execute Rehearsed Selective Production Cutover
T41 — Expanded Post-Cutover Verification
```

T32.9A.9 is the final canonical cutover sequence. It is not limited to Admin
Integration Smoke. Production cutover is selective/incremental: 9P then 9D0 then 9D. A full empty-database Firestore reset is nonproduction architectural rehearsal only and is not the production procedure.

Booking-specific authority rule for cutover:

```text
Canonical Booking owns lifecycle,
not progress / presentation / feedback data by default.
```

Recommendation, feedback, and progress must first receive the correct
canonical authority (T32.9A.9B / 9C). They must not be auto-added as fields on
canonical Booking merely because the lifecycle cutover is underway.

Reviews / instructor rating continuity is mandatory 9B scope.

9B.3 Canonical Lesson Feedback (READY_FOR_MANUAL_SMOKE in source; production smoke not yet recorded) restores Instructor/Student recommendation UX on `/participant_lesson_feedback/{feedbackId}` with identity `participantId + lessonBookingId`. Attendance=`present` is the instructor write gate. There is no InstructorRelationship bypass, no Booking.recommendations fallback, and no dual-write. Legacy `bookings.recommendations` / `completedRecommendationIds` remain leftover production fields until 9P/9D.

Chat and Homework (currently `bookings/{threadId}/messages`, including `isHomework` / `homeworkForUserIds`) remain a separate live capability and mandatory 9P rows. 9B.3 must not migrate or delete them. Do not delete a Booking parent/thread and lose messages. This ADR does not require a new Chat aggregate.

### T32.9B — Final Legacy Write / Runtime Cleanup

T32.9B starts only after **T32.9A.9E PASS**.

T32.9B may remove a legacy implementation only after its useful product
capability has a canonical replacement implemented **and** UX parity proven.

T32.9B must not become a product-feature deletion phase. If physical cleanup discovers a useful capability without a canonical/approved replacement: STOP, treat the 9P inventory as incomplete, and return the problem to canonical migration. Unreachable leftover
helpers may be removed only after the useful capability they once served is
preserved on the canonical path, or after an accepted product decision has
superseded that capability.

T32.9B is physical cleanup after authority cutover, not authority migration
itself.

## Consequences

- Future T32, T33, and later slices treat UX capability parity as a PASS
  criterion equal to domain, security, data, and regression acceptance.
- Frontend/runtime cleanup is gated by a UX parity inventory, not by the mere
  existence of a canonical command or read model.
- Agents and developers must not invent UX reductions; unapproved product
  changes require an explicit owner decision.
- Admin-specific capability lists belong in T32.9A documentation; this ADR
  remains the durable global rule: preserve product capability, replace
  implementation.
