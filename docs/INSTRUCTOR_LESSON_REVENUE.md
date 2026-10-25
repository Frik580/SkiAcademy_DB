# Instructor completed-lesson revenue

## Contract

School revenue for an Instructor over all time is
`Σ Payment.retainedAmount` for unique canonical Bookings whose
`lifecycle.status === 'completed'` and `occurrence.instructorId` matches that
Instructor. Family/group participants share one Booking contribution. No
CourseEnrollment, compensation, tariff recalculation, Wallet mutation, Attendance,
XP or level calculation is involved.

All amounts remain canonical integer KZT units, validated by `PaymentSchema` and
`KztMinorUnitsSchema`, and displayed using the existing product KZT convention.
PaymentSchema checks `retainedAmount = paidAmount - refundedAmount`, obligation
allocation and paymentStatus, including partially funded and refunded Payments.
An unpaid or free valid Payment contributes zero. Missing/invalid Payment,
mismatched subject/payment ID or scope makes the Instructor total unavailable.

## Rebuildable projection and authorization

- `instructor_lesson_revenue_contributions/{bookingId}` is server-only bookkeeping:
  summary path, retained amount, unavailable count and Booking/Payment revisions.
- `instructor_lesson_revenue/{live|test_<testSessionId>}/instructors/{instructorId}`
  contains only `retainedAmount`, `unavailableCount`, `revision`.
- Scope parent documents contain only canonical scope fields, for repair inventory.
- `instructor_lesson_revenue/state` contains `ready`. Missing/false hides all totals
  during initial population or an explicit operator reconciliation.
- `instructor_lesson_revenue/reconciliation_lock` prevents concurrent rebuilds.

Booking and Payment `onDocumentWritten` triggers re-read current Booking, Payment
and previous contribution inside one Firestore transaction. They replace one
contribution and update old/new summaries together. Duplicate/stale events cannot
reapply amounts. Revisions changing without amount/availability/owner changes
update only the contribution. Deletes remove the previous contribution. Malformed
attribution with a previous contribution makes that Instructor unavailable without
blocking another scope; a new unattributable record fails and retries until source
repair. Canonical data is never repaired by this projection.

The callable `resolveInstructorLessonRevenue` accepts no Instructor ID. It validates
`auth.uid`, canonical Account lifecycle, trusted Account→Instructor link, and the
existing server read-scope resolver (including active product_test assignment).
It returns only two subscription paths. Firestore Rules independently enforce
the active account, same Instructor and live/test-session scope on each exact
summary get/listener. Lists, all client writes, contributions and Payment access
remain denied. No client receives customer payment details.

The workspace owns one listener for its summary and one for readiness. It shows
loading until both server snapshots arrive, then loaded (including real zero),
unavailable or error. Missing summary means zero only after completed backfill.
Refunds/corrections propagate through Payment triggers without polling. Re-entry,
reload, account changes and window focus re-authorize the subscription; listeners
are disposed on cleanup. Updates are eventually consistent with Firestore trigger
delivery, rather than part of the authoritative payment transaction.

## Firestore cost and bounds

These are additional reads for this metric. Existing hot/history lesson loading
is unchanged and is not used to calculate revenue.

- Per workspace subscription: one callable reads the Account and TestActor registry
  (two documents for LIVE; assignment and TestSession add two for product_test),
  followed by two exact document listeners. Rules dependency reads additionally
  apply under Firestore billing. Subsequent normal money changes deliver one
  summary document, not the history. No polling and no Payment reads on the client.
- Per Booking event: two exact reads (Booking + contribution), plus Payment for
  completed Bookings. A changed contribution amount/availability/owner reads one
  summary, or two on reassignment. Maximum normal transaction: five document reads;
  retries can add reads. CourseEnrollment Payment events return without reads.
- Normal writes: contribution and changed summary (two for reassignment); scope
  parent metadata is written only for a new contribution/scope. Unchanged duplicate events write nothing. Revision-only changes
  do not wake summary subscribers.
- The operator tool performs full server drains of Bookings, contributions and
  scoped summary inventory in pages of 100. It also repairs aggregate drift by
  paginating contributions with `summaryPath == exactPath`, ordered by document ID.
  Summary updateTime guards prevent overwriting concurrent delta updates; up to
  five attempts, then operator retry. Memory and batch sizes are bounded.
- Existing automatic single-field indexes suffice. No composite index or scheduler
  is added. Product requests never invoke a drain or scan.

## Deployment and initial fill (not executed by this task)

No production calls, deploy, commit, push or merge are part of implementation.
After separate deployment authorization, in PowerShell from repository root:

```powershell
npm run build:functions
firebase deploy --project ski-school-8f3ca --only "functions:resolveInstructorLessonRevenue,functions:syncInstructorLessonRevenueBooking,functions:syncInstructorLessonRevenuePayment"
firebase deploy --project ski-school-8f3ca --only firestore:rules
node functions/scripts/reconcileInstructorLessonRevenue.cjs --project ski-school-8f3ca
node functions/scripts/reconcileInstructorLessonRevenue.cjs --project ski-school-8f3ca --apply
npm run build:prod
firebase deploy --project ski-school-8f3ca --only hosting
```

The command without `--apply` only inventories rows. Deploy triggers before the
fill so concurrent canonical changes are captured. `--apply` locks reconciliation,
sets ready=false, repairs prior aggregate drift, drains current Bookings and
contributions (including orphan deletions), repairs totals again and sets ready=true
only after success. A failed run leaves ready=false and releases its lock during
normal exception cleanup. Missing Payments remain explicit unavailable counts;
they do not prevent complete inventory. No canonical or historical data is deleted.

## Recovery

After a missed trigger or projection drift, rerun the same `--apply` tool. Repair
reads current authorities; it does not trust event order or reset canonical data.

A killed process may leave a lock. Before releasing it, verify that the earlier
reconciliation process has stopped on every operator host. Do not unlock a live
run: that could let a second operator publish readiness prematurely. Then use the
explicit derived-lock-only command and rerun the fill:

```powershell
node functions/scripts/reconcileInstructorLessonRevenue.cjs --project ski-school-8f3ca --release-stale-lock --apply
node functions/scripts/reconcileInstructorLessonRevenue.cjs --project ski-school-8f3ca --apply
```

The unlock command changes only the fixed projection lock document, leaves
readiness unchanged, and is never automatic. Correct malformed canonical sources
through their authorized domain workflows before rerunning. Trigger retry/failure
monitoring remains the existing Functions operational responsibility.

## Changed-file inventory

Shared contract:
`packages/shared-domain/src/canonical/index.ts`,
`packages/shared-domain/src/canonical/readModels/instructorLessonRevenue.ts`.

Server and operator tool:
`functions/src/index.ts`,
`functions/src/canonical/readModels/instructorLessonRevenueProjection.ts`,
`functions/src/canonical/readModels/resolveInstructorLessonRevenueCallable.ts`,
`functions/scripts/reconcileInstructorLessonRevenue.cjs`, `firestore.rules`.

Workspace and transport:
`src/features/instructor-workspace/instructorLessonMetrics.ts`,
`src/features/instructor-workspace/instructorLessonRevenue.ts`,
`src/features/instructor-workspace/useInstructorLessonRevenue.ts`,
`src/features/instructor-workspace/components/useInstructorWorkspace.ts`,
`src/features/instructor-workspace/components/InstructorDashboardHeader.tsx`,
`src/lib/canonical/canonicalReadModelClient.ts`, `src/lib/i18n/translations.ts`.

Verification:
`functions/src/canonical/readModels/instructorLessonRevenueProjection.test.ts`,
`functions/src/canonical/readModels/instructorLessonRevenue.emulator.test.ts`,
`tests/helpers/instructorRevenueFixtures.ts`,
`tests/integration/instructorLessonRevenue.rules.test.ts`,
`tests/unit/instructorLessonMetrics.test.ts`,
`tests/unit/instructorLessonRevenue.test.tsx`, `e2e/instructor-revenue.spec.ts`.

Documentation: this file, `CONTEXT.md` and `docs/adr/0003-payment-accounting-source.md`.
