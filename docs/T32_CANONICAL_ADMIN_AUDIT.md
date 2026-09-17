# T32 Canonical Admin Audit Report

Date: 2026-08-30  
Amended: 2026-09-01 — T32.8A, T32.8B, and T32.8C PASS; guest confirmation policy recorded in [ADR-0007](adr/0007-guest-identity-payment-and-confirmation.md); T32.9 split and global UX preservation recorded in [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)
Amended: 2026-09-07 — T32.9A.8 PASS/CLOSED; T32.9A.9 redefined as FINAL CANONICAL CUTOVER (9A–9E); T32.9A.9A core authority cutover recorded; F1/F2 required before 9A close; production Booking inventory and legacy Individual Booking callable cleanup recorded
Amended: 2026-09-07 — T32.9A.9A.F3 (Canonical Multi-Participant Lesson Booking) added to roadmap after F2; F2 F3-compatibility requirement recorded; 9A final integration / production smoke gated after F3
Amended: 2026-09-07 — T32.9A.9A.F2 funded-pending-after-deadline limbo policy documented; reservation deadline vs confirmation reconciliation distinction recorded in ADR-0007
Amended: 2026-09-08 — T32.9A.9A.F3 implemented for authenticated/managed Participants and moved to READY_FOR_MANUAL_SMOKE; guest creation remains single-participant by explicit boundary; canonical additional-participant surcharge is per hour of lesson duration and is snapshotted with duration
Amended: 2026-09-08 — T32.9A.9 cutover gates strengthened for incremental production: 9B Reviews/rating continuity; 9P Global Product Parity; 9D0 production-like incremental rehearsal; 9D Selective Destructive Legacy Data Cleanup (not full Firestore reset); 9E technical+product reachability; T40/T41 superseded from empty-database reset to rehearsed selective production cutover. F3 implementation/contract is unchanged.
Amended: 2026-09-09 — T32.9A.9A.F4 (Canonical Multi-Participant Lesson Attendance UX) documented; per-participant Instructor Attendance for individual and `family_group` lesson Booking; F4 READY_FOR_MANUAL_SMOKE; 9A final integration / production smoke gated after F4
Amended: 2026-09-09 — T32.9A.9A.F1 reconciled to PASS / DEPLOYED; F3 reconciled to PASS / CLOSED after manual acceptance; F4 remains READY_FOR_MANUAL_SMOKE
Amended: 2026-09-10 — T32.9A.9A final integration / production smoke PASS; F2/F4 reconciled to PASS / CLOSED; T32.9A.9A overall PASS / CLOSED; active cutover stage → T32.9A.9B
Amended: 2026-09-11 — T32.9A.9B.2 Participant Progress: Product Owner cancelled legacy `/users` progress migration; canonical `/participant_progress` is empty-start authority; Data migration: NO; deploy Functions → Hosting → Rules
Amended: 2026-09-11 — T32.9A.9B.2 implementation recorded: Participant-scoped authority, Student Cabinet selection policy, Instructor progress (relationship + booking evidence), lesson-context assessment gate aligned with backend booking-based evidence; **READY_FOR_MANUAL_SMOKE** (production deploy + manual acceptance not yet recorded here); next sub-slice **T32.9A.9B.3** Recommendations / Lesson Feedback continuity
Amended: 2026-09-11 — T32.9A.9B.2 **PASS / CLOSED** after production deploy (Functions → Hosting → Firestore Rules) and manual acceptance smoke **PASS** (2026-09-11); active 9B sub-slice **T32.9A.9B.3** — NEXT
Amended: 2026-09-11 — T32.9A.9B.3 Canonical Lesson Feedback implemented through 9B.3E isolation/cleanup/integration gate; **READY_FOR_MANUAL_SMOKE** (production deploy + manual acceptance not yet recorded); Chat Homework preserved and out of 9B.3; next sub-slice **T32.9A.9B.4** Stats / Achievements
Amended: 2026-09-12 — T32.9A.9B.3 **PASS / CLOSED** after production deploy (indexes → Functions → Rules → Hosting) and manual acceptance smoke **PASS**; active 9B sub-slice **T32.9A.9B.4** Stats / Achievements — NEXT; **T32.9A.9P.HW1** Participant-scoped Chat Homework recorded as known parity item (not in ParticipantLessonFeedback scope)
Amended: 2026-09-12 — T32.9A.9B.4 Stats / Achievements isolation + integration gate (9B.4E) complete; **READY_FOR_MANUAL_SMOKE** (production deploy + authenticated manual smoke not yet recorded). Course metrics remain **T32.9A.9C**. Chat Homework remains **T32.9A.9P.HW1**. 9B.5 is not an accepted roadmap ticket.
Amended: 2026-09-13 — T32.9A.9A.F5 Canonical Guest Course Reservation Expiry added as a post-close corrective follow-up after a separate guest CourseEnrollment expiry/runtime gap was identified. Existing F1–F4 acceptance remains valid.
Amended: 2026-09-13 — Reviews / Instructor Rating Continuity production deploy and authenticated manual smoke **PASS**; legacy review write/read, rating fallback, and dual-write reachability are each zero. T32.9A.9B.4 Stats / Achievements production smoke is also **PASS**. With no other accepted mandatory 9B capability (9B.5 is not an accepted ticket), **T32.9A.9B is PASS / CLOSED**; next accepted slice is **T32.9A.9C**.
Amended: 2026-09-13 — **T32.9R** Firestore / server-resource optimization status reconciled. Completed small read bounds (BG1, UI1/UI1B, P0A/P0B, A2, R1A, M1/M2; BG2 implemented+migrated). **R1** physical `account_history` pagination and **R2** maintained participant stats projection are **DEFERRED** (not next coding tickets). Next optimization step is deploy/runtime verification of remaining READY items, then production re-measurement — not speculative projection work. See **T32.9R** below. Historical scratch audits under `.scratch/` remain evidence, not roadmap authority.
Amended: 2026-09-14 — **T32.9A.9P BLOCKED** after independent review. 9P.HW1 participant-scoped Chat Homework is implemented. Guest course expiry / deployed `createGuestCourseEnrollment` remain **T32.9A.9A.F5** (READY_FOR_DEPLOY, production inventory unknown). Leftover `users.balanceUSD` signup write and `amountUsd` gift fallback remain documented compatibility, not 9P PASS. Next destructive slice **T32.9A.9D0 is forbidden** until 9P PASS.
Amended: 2026-09-14 — **T32.9A.9P PASS / CLOSED** for source / current production client (leftover counters WRITE / authority READ / fallback / dual-write = 0). Gift field names remain **KEEP_COMPATIBILITY**, not leftover authority. **T32.9A.9D0 PASS / CLOSED**: exact source delete manifest rehearsed; destructive data list = NONE; production Function deletions **BLOCKED_BY_F5** + **BLOCKED_BY_PRODUCTION_INVENTORY**. **T32.9A.9D NOT STARTED**. **T32.9A.9A.F5** remains READY_FOR_DEPLOY / production inventory UNKNOWN.
Amended: 2026-09-14 — **T32.9A.9A.F5** production inventory independently re-listed on `ski-school-8f3ca`: `createGuestCourseEnrollment` = **ABSENT** (no longer a blocker); `executeGuestCanonicalCommand` = ACTIVE; `scheduledExpireGuestCourseReservations` = ACTIVE; Cloud Scheduler every 5 minutes UTC with healthy no-op executions (`scannedCandidates: 0`, `failed: 0`). F5 is **BLOCKED_ONLY_BY_PRODUCTION_EXPIRY_SMOKE** (24h TTL; no safe test/admin clock or force-expire path; no natural expired candidate in the observed window). **9D0 remains PASS / CLOSED**. **9D NOT STARTED**.
Amended: 2026-09-15 — Admin Active Bookings guest CourseEnrollment duplicate rows closed **PASS / DEPLOYED / RUNTIME VERIFIED**. One canonical `CourseEnrollment` produces one Active Bookings row: `admin_course_roster ∪ admin_pending_guest` keyed by `enrollmentId`, roster precedence. Hosting + `queryAdminCourseEnrollmentReadModels` (`queryadmincourseenrollmentreadmodels-00010-bit`) deployed; authenticated production smoke PASS.
Amended: 2026-09-15 — Admin Lessons + Courses consolidation **DEPLOYED / AUTHENTICATED SMOKE BLOCKED**. Hosting + `executeCanonicalCommand` (`executecanonicalcommand-00054-yof`) + `queryAdminCourseEnrollmentReadModels` (`queryadmincourseenrollmentreadmodels-00011-cug`) cutover complete. Authenticated `/admin` smoke not verified: agent browser has no admin session (Sign In required). Final `PASS / DEPLOYED / RUNTIME VERIFIED` is not recorded.
Amended: 2026-09-16 — **T32.9A.9A.F5 PASS / CLOSED.** The production expiry smoke recorded below completed successfully: a real unpaid `pending` guest CourseEnrollment past `reservationExpiresAt` was discovered by `scheduledExpireGuestCourseReservations`, cancelled with `reasonCode: reservation_expired`, and its seat plus resource claims were released, with the following scheduler run a no-op replay. F5 is no longer **BLOCKED_ONLY_BY_PRODUCTION_EXPIRY_SMOKE** and no longer blocks downstream cutover gates on canonical guest course lifecycle. The dated 2026-09-13/2026-09-14 entries above remain the correct historical record of the state on those dates.
Amended: 2026-09-16 — Admin Lessons + Courses consolidation **PASS / DEPLOYED / RUNTIME VERIFIED.** The authenticated production smoke deferred on 2026-09-15 completed successfully on the deployed revisions (Hosting, `executeCanonicalCommand` `executecanonicalcommand-00054-yof`, `queryAdminCourseEnrollmentReadModels` `queryadmincourseenrollmentreadmodels-00011-cug`). The dated 2026-09-15 entry above remains the correct historical record of the state on that date; `DEPLOYED / AUTHENTICATED SMOKE BLOCKED` is no longer the current status.
Amended: 2026-09-16 — **T32.9R.P0B lesson-booking post-command read optimization completed and reconciled.** The original hypothesis (global `/cabinet*` 30-second `account_hot` polling) was **NOT CONFIRMED**: surface scoping was already present, and no periodic 30s timer polled `account_hot`. The implemented optimization removes the unnecessary post-command `account_history` read on every non-history surface, and fixes `/cabinet/profile_journey` as a history-owning surface. Follow-up recorded, unchanged by this ticket: **>25 `account_hot` page-1 reconciliation prune**. See **T32.9R.P0B** below and [issue 42](../.scratch/canonical-booking-domain-rewrite/issues/42-account-hot-page1-reconciliation-prune.md).
Amended: 2026-09-16 — **T32.9A.9D PASS / CLOSED.** Physical source cleanup from the 9D0 DELETE_FILES / DELETE_EXPORTS lists completed. Leftover source reachability counters ACTIVE_WRITE / AUTHORITY_READ / FALLBACK / DUAL_WRITE = 0. Historical Firestore data, Rules, indexes, Storage, and production Function deletes were not part of 9D. Next accepted cutover gate is **T32.9A.9E**. Recorded T32.9R follow-up **#42** remains open on the optimization track and does not reopen 9D.
Amended: 2026-09-18 — **T39 PASS / CLOSED.** Exact production delete of four approved documents completed after JSON backup: `reviews/rev_dlc2wig`, `reviews/rev_kcysdj3`, `reviews/rev_zux6z99`, `settings/guest_wallet`. Post-delete: `/reviews` = 0; those four GET = 404; `/instructor_reviews` = 2; `wallet_ledger` = 17; messages = 25; `payments` = 69; `monetary_events` = 77. Backup is local `t39-backup/`, not committed. Next accepted slice is **T40**.
Amended: 2026-09-18 — **T39 READY_FOR_EXACT_DESTRUCTIVE_APPROVAL.** Read-only production inventory on `ski-school-8f3ca` verified exact counts. No Firestore data was deleted. Exact delete list is four documents after export/backup. Independent destructive review **APPROVE_WITH_FINDINGS** (non-blocking). Recorded T32.9R follow-up **#42** remains open and does not reopen T32.9B / T39 inventory.
Amended: 2026-09-18 — **T32.9B PASS / CLOSED. T39 READY_FOR_DESTRUCTIVE_APPROVAL.** Approved leftover source compatibility cleanup from the 9E deferred list completed. Leftover source counters remain ACTIVE_WRITE / AUTHORITY_READ / FALLBACK / DUAL_WRITE = 0. Independent review **APPROVE_WITH_FINDINGS** (non-blocking). Production Firestore data was not deleted. T39 exact destructive manifest is prepared; execution waits for explicit approval. Production counts **NOT VERIFIED** (Firebase credentials expired). Recorded T32.9R follow-up **#42** remains open and does not reopen T32.9B.
Amended: 2026-09-17 — **T32.9A.9E PASS / CLOSED. T32.9A PASS / CLOSED.** Final reachability / integration gate confirmed leftover source counters = 0, canonical capability parity, participant isolation, canonical KZT money authority, and production Function inventory with no deployed leftover lesson/course lifecycle names. Next accepted slice is **T32.9B / T39**. Recorded T32.9R follow-up **#42** remains open on the optimization track and does not reopen T32.9A.
Amended: 2026-09-16 — **Current remaining cutover sequence after the F5 and Admin Lessons + Courses closures, subsequently updated by 9D PASS the same day and closed by 9E on 2026-09-17.** 9B / 9C / 9P / 9D0 / **9D** / **9E** / **T32.9A** remain **PASS / CLOSED** and are not reopened. The next accepted slice is **T32.9B / T39**. Recorded T32.9R follow-up **#42 — `account_hot` page-1 reconciliation >25** (`P0B-PRUNE`) remains open on the optimization track and is not an R-ticket:

```text
DONE  T32.9A.9A.F5
DONE  Admin Lessons + Courses authenticated production smoke

DONE  T32.9A.9D — physical source cleanup PASS / CLOSED (2026-09-16)

DONE  T32.9A.9E — Canonical Authority / Reachability Gate PASS / CLOSED (2026-09-17)
DONE  T32.9A — PASS / CLOSED (2026-09-17)
DONE  T32.9B — source compatibility cleanup PASS / CLOSED (2026-09-18)
  ↓
DONE  T39 — historical data cleanup PASS / CLOSED (2026-09-18; exact 4 documents)
  ↓
NEXT  T40 — Execute Rehearsed Selective Production Cutover
  ↓
T40 — Execute Rehearsed Selective Production Cutover
  ↓
T41 — Expanded Post-Cutover Verification
```

**T32.9R optimization track (unchanged strategic decision).** **R1 = DEFERRED / BLOCKED** and **R2 = DEFERRED**; neither is promoted to NEXT and no new R-ticket is created. Remaining implemented optimization items are deploy/runtime verified first, then production Firestore / Functions usage is re-measured, and only then is the next optimization chosen from measured cost.

Status: historical Admin-runtime audit from 2026-08-30, with later T32.8A–T32.8C and T32.9A/T32.9B migration status below. Findings in this document that describe unpaid Administrator guest approval, missing guest CourseEnrollment confirmation, or identity linking as confirmation are superseded by ADR-0007. Sections below that still describe the 2026-08-30 Admin runtime as fully legacy are historical audit evidence; later migration status in this preamble supersedes them for T32.9A progress.

## Later migration status: T32.8A–T32.8C and T32.9

| Slice  | Name                                                                                                                    | Status |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| T32.8A | Canonical identity administration (Account, Participant, ParticipantManagement, Account → managed Participant selector) | PASS   |
| T32.8B | Admin-assisted guest identity linking (`existing_managed`)                                                              | PASS   |
| T32.8C | Payment-Driven Guest Confirmation                                                                                       | PASS   |

T32.8C was previously scoped as a deferred guest-approval policy review. That name and unpaid-approval reading are superseded. T32.8C implements payment-funded guest confirmation for Lesson Booking and CourseEnrollment.

Explicitly deferred after T32.8C:

- `pay_on_site`, cash-at-start, deferred payment, and unpaid Admin override;
- partially-paid pending guest rejection or refund policy;
- unused unmanaged guest Participant cleanup.

T32.9 remains split per [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md). T32.9A is Admin UX restoration and canonical integration plus final authority cutover (9A–9E, including 9P and 9D0); T32.9B is physical legacy-runtime cleanup after the 9E gate. Production cutover is selective/incremental. Full empty-database Firestore reset is a nonproduction architectural rehearsal only (T38 / original Phase 7 contract) and is not a production instruction.

### Status table (current)

| Slice                                          | Name                                                                     | Status                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| T32.9A.8A                                      | Canonical Courses UX — archived/reactivate foundations                   | PASS / CLOSED                             |
| T32.9A.8B                                      | Canonical Courses UX — edit / catalog ownership                          | PASS / CLOSED                             |
| T32.9A.8C                                      | Canonical Courses UX — archived courses + reactivate + cursor pagination | PASS / CLOSED                             |
| T32.9A.8                                       | Canonical Courses UX                                                     | PASS / CLOSED                             |
| T32.9A.9A core                                 | Individual Booking lifecycle cutover (authority)                         | PASS at source/production authority level |
| T32.9A.9A.F1                                   | Canonical Admin Guest Payment Capture                                    | PASS / DEPLOYED                           |
| T32.9A.9A.F2                                   | Guest Unpaid Reservation Expiry                                          | PASS / CLOSED                             |
| T32.9A.9A.F3                                   | Canonical Multi-Participant Lesson Booking                               | PASS / CLOSED                             |
| T32.9A.9A.F4                                   | Canonical Multi-Participant Lesson Attendance UX                         | PASS / CLOSED                             |
| T32.9A.9A final integration / production smoke | 9A close gate after F4                                                   | PASS                                      |
| T32.9A.9A.F5                                   | Canonical Guest Course Reservation Expiry                                | PASS / CLOSED                             |
| Admin Active Bookings CourseEnrollment uniqueness | Roster ∪ pending_guest by `enrollmentId` (roster precedence)          | PASS / DEPLOYED / RUNTIME VERIFIED        |
| Admin Lessons + Courses consolidation              | Unified admin «Занятия и курсы» + course payment capture             | PASS / DEPLOYED / RUNTIME VERIFIED        |
| T32.9A.9A                                      | Individual Booking lifecycle cutover (overall)                           | PASS / CLOSED                             |
| T32.9A.9B                                      | Student Booking Stats / Progress / Recommendations / Reviews Cutover     | PASS / CLOSED                             |
| T32.9A.9B.2                                    | Canonical Participant Progress                                           | PASS / CLOSED                             |
| T32.9A.9B.3                                    | Recommendations / Lesson Feedback continuity                             | PASS / CLOSED                             |
| T32.9A.9B.4                                    | Stats / Achievements                                                     | PASS / CLOSED                             |
| Reviews / Instructor Rating Continuity         | Canonical review command, read models, rating summaries, legacy gate     | PASS / CLOSED                             |
| T32.9R                                         | Firestore / server-resource optimization (parallel to cutover)           | ACTIVE — see T32.9R status table          |
| T32.9A.9C                                      | Course Progress / Achievements Cutover                                   | PASS / CLOSED                             |
| T32.9A.9P                                      | Global Product Parity & Legacy Dependency Gate                           | PASS / CLOSED                             |
| T32.9A.9D0                                     | Production-like Incremental Cutover Rehearsal                            | PASS / CLOSED                             |
| T32.9A.9D                                      | Selective Destructive Legacy Data Cleanup                                | PASS / CLOSED                             |
| T32.9A.9E                                      | Canonical Authority / Reachability Gate                                  | PASS / CLOSED                             |
| T32.9A                                         | Canonical Admin UX restoration and integration                           | PASS / CLOSED                             |
| T32.9B                                         | Final Legacy Write / Runtime Cleanup                                     | PASS / CLOSED                             |
| T39                                            | Historical compatibility data cleanup                                    | PASS / CLOSED                             |
| T40                                            | Execute Rehearsed Selective Production Cutover                           | PENDING                                   |
| T41                                            | Expanded Post-Cutover Verification                                       | PENDING; after T40                        |

Status labels used here: `PASS`, `PASS / CLOSED`, `PASS / DEPLOYED`, `PASS / DEPLOYED / RUNTIME VERIFIED`, `REQUIRED`, `IN PROGRESS`, `PLANNED`, `READY_FOR_MANUAL_SMOKE`, `READY_FOR_DEPLOY`, `DEPLOY-RUNTIME-VERIFICATION-PENDING`, `DEFERRED`, `PENDING`, `NOT CLOSED`. T32.9A.9A original F1–F4 integration close (including final integration / production smoke) remains **PASS / CLOSED**. **T32.9A.9A.F5** is a post-close corrective follow-up on guest CourseEnrollment reservation expiry; it is now **PASS / CLOSED** (production expiry smoke PASS, 2026-09-16) and it never reopened or invalidated F1–F4. **Admin Active Bookings CourseEnrollment uniqueness is PASS / DEPLOYED / RUNTIME VERIFIED** (2026-09-15). **Admin Lessons + Courses consolidation is PASS / DEPLOYED / RUNTIME VERIFIED** (authenticated production smoke PASS, 2026-09-16). **T32.9A.9B is PASS / CLOSED**. **T32.9A.9C is PASS / CLOSED**. **T32.9A.9P is PASS / CLOSED** for source / current production client (leftover counters = 0; gift fields KEEP_COMPATIBILITY). **T32.9A.9D0 is PASS / CLOSED** (exact source delete manifest; data delete = NONE; production Function delete gated). **T32.9A.9D is PASS / CLOSED** (physical source cleanup 2026-09-16; leftover source counters = 0; historical data untouched; production Function delete still inventory-gated and not executed). **T32.9A.9E is PASS / CLOSED** (2026-09-17; leftover counters = 0; production inventory lists no leftover lesson/course lifecycle Functions; canonical schedulers healthy). **T32.9A is PASS / CLOSED**. Production inventory for F5 was confirmed 2026-09-14 and re-confirmed 2026-09-17: `createGuestCourseEnrollment` ABSENT; scheduler ACTIVE. **T32.9R** is a parallel read-cost track: **R1 DEFERRED / BLOCKED** and **R2 DEFERRED**; neither is a mandatory next implementation ticket and no new R-ticket is created.

#### Admin Lessons + Courses consolidation — PASS / DEPLOYED / RUNTIME VERIFIED

UI/read-model consolidation only. `LessonBooking` and `CourseEnrollment` remain separate canonical entities. Production Admin Panel mounts one section **«Занятия и курсы»** (`canonical_training_records`). Course unpaid capture uses existing `record_provider_payment_event` with projection `canRecordPayment`.

**Production cutover 2026-09-15 (isolated from unrelated WIP):**

- Hosting: YES (`https://ski-school-8f3ca.web.app`)
- Functions: `executeCanonicalCommand` revision `executecanonicalcommand-00054-yof`; `queryAdminCourseEnrollmentReadModels` revision `queryadmincourseenrollmentreadmodels-00011-cug`
- Rules / indexes / migration: NO

**Authenticated smoke: PASS (2026-09-16).** The 2026-09-15 blocker (agent browser had no admin session) was resolved and the authenticated `/admin` smoke was exercised on production against the deployed revisions above: lesson/course filters, enroll-on-behalf, payment capture mutation, and issue/attendance operations on the unified «Занятия и курсы» section all behaved as expected, with authenticated invocations of the new revisions observed.

The earlier `DEPLOYED / AUTHENTICATED SMOKE BLOCKED` line in the amendment list above is the dated 2026-09-15 record, not the current status. Old `AdminCourseEnrollmentPanel` remains as compatibility/test source and was not deleted.

#### Admin Active Bookings CourseEnrollment uniqueness — PASS / DEPLOYED / RUNTIME VERIFIED

Post-close Admin Operations corrective follow-up (2026-09-15). Guest CourseEnrollments that matched both `admin_course_roster` and `admin_pending_guest` were concatenated into duplicate Active Bookings rows. Guest creation, payments, and enrollment idempotency were not the defect.

**Invariant:** one canonical `CourseEnrollment` ⇒ one Active Bookings row.

**Implementation:** `unionAdminMonitorCourseEnrollments` in `useAdminMonitorReadModels` — `admin_course_roster ∪ admin_pending_guest` keyed only by canonical `enrollmentId`; roster has precedence and order; pending contributes only enrollmentIds absent from roster. Distinct `enrollmentId`s remain separate rows even when guest name and course match.

**Production:** Hosting deployed; `queryAdminCourseEnrollmentReadModels` revision `queryadmincourseenrollmentreadmodels-00010-bit` replaced the diagnostic callable. Authenticated production smoke PASS (Tyra = 1 row, Petrosin = 1 row; no TEMP diagnostics; filters and client pagination remain removed; lesson and course row actions work).

This does not reopen T32.9A.9A F1–F4 or change F5 expiry work.

T32.9A.9A remains historically **PASS / CLOSED** for the original Individual Booking F1–F4 cutover. F5 was added after that close when a separate guest CourseEnrollment lifecycle/runtime gap was identified. F5 never invalidated completed Individual Booking lifecycle work, and it has since reached **PASS / CLOSED** (production expiry smoke PASS, 2026-09-16), so final legacy guest CourseEnrollment removal and the downstream destructive cutover gates may now treat canonical guest course lifecycle as complete (subject to the separate production Function-delete inventory gate).

### T32.9A.8 — Canonical Courses UX — PASS / CLOSED

```text
T32.9A.8A — PASS / CLOSED
T32.9A.8B — PASS / CLOSED
T32.9A.8C — PASS / CLOSED
```

### T32.9A.9 — FINAL CANONICAL CUTOVER

T32.9A.9 is **not** “Admin Integration Smoke only.” It is the final canonical cutover sequence. There is **one** production path (selective/incremental). The original Phase 7 empty-database reset remains historical/reference and T38 nonproduction rehearsal only.

```text
T32.9A.9A — Individual Booking lifecycle cutover — PASS / CLOSED
  T32.9A.9A core
  T32.9A.9A.F1 — Canonical Admin Guest Payment Capture
  T32.9A.9A.F2 — Guest Unpaid Reservation Expiry
  T32.9A.9A.F3 — Canonical Multi-Participant Lesson Booking
  T32.9A.9A.F4 — Canonical Multi-Participant Lesson Attendance UX
  T32.9A.9A final integration / production smoke
  T32.9A.9A.F5 — Canonical Guest Course Reservation Expiry — PASS / CLOSED (inventory PASS 2026-09-14; production expiry smoke PASS 2026-09-16)
  Admin Active Bookings CourseEnrollment uniqueness — PASS / DEPLOYED / RUNTIME VERIFIED
  Admin Lessons + Courses consolidation — PASS / DEPLOYED / RUNTIME VERIFIED (authenticated smoke PASS 2026-09-16)
T32.9A.9B — Student Booking Stats / Progress / Recommendations Cutover — PASS / CLOSED
         (includes Reviews / Instructor Rating Continuity)
  T32.9A.9B.2 — Canonical Participant Progress — PASS / CLOSED (production smoke 2026-09-11)
  T32.9A.9B.3 — Recommendations / Lesson Feedback continuity — PASS / CLOSED (production smoke 2026-09-12)
  T32.9A.9B.4 — Stats / Achievements — PASS / CLOSED
  Reviews / Instructor Rating Continuity — PASS / CLOSED
T32.9A.9C — Course Progress / Achievements Cutover — PASS / CLOSED
T32.9A.9P — Global Product Parity & Legacy Dependency Gate — PASS / CLOSED
T32.9A.9D0 — Production-like Incremental Cutover Rehearsal — PASS / CLOSED
T32.9A.9D — Selective Destructive Legacy Data Cleanup — PASS / CLOSED (physical source cleanup 2026-09-16)
T32.9A.9E — Canonical Authority / Reachability Gate — PASS / CLOSED (2026-09-17)
T32.9A — PASS / CLOSED (2026-09-17)
#42 — account_hot page-1 reconciliation >25 correctness — recorded T32.9R follow-up, not a T32.9A blocker
THEN
T32.9B — PASS / CLOSED (2026-09-18)
T39 — PASS / CLOSED (2026-09-18; exact 4 documents)
THEN
T40 — Execute Rehearsed Selective Production Cutover
T41 — Expanded Post-Cutover Verification
```

Do not change the F3 multi-participant design in this sequence. F3 remains a 9A slice; later gates consume it, they do not reopen it.

Architectural principle (see also [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)):

```text
LEGACY IMPLEMENTATION != LEGACY FEATURE

Preserve useful UX
  → replace backend authority
  → add canonical UX
  → prove parity
  → remove legacy implementation
```

Booking-specific rule for this cutover:

```text
Canonical Booking owns lifecycle,
not progress / presentation / feedback data by default.
```

#### T32.9A.9A — Individual Booking lifecycle cutover — PASS / CLOSED

**T32.9A.9A is PASS / CLOSED** after production final integration smoke (F1 `PASS / DEPLOYED`; F2/F3/F4 `PASS / CLOSED`). That close covered the original F1–F4 Individual Booking integration gate only. **T32.9A.9A.F5** was a later corrective follow-up for guest CourseEnrollment automatic reservation expiry; it never changed the recorded F1–F4 or final smoke outcomes and is now **PASS / CLOSED** (2026-09-16). The current cutover position is: 9B / 9C / 9P / 9D0 / **9D / 9E / T32.9A PASS / CLOSED**, next accepted slice **T32.9B / T39**. Recorded T32.9R follow-up **#42** remains open and does not reopen 9D.

Core lifecycle cutover (authority level) — recorded as PASS at source/production authority level:

- canonical Booking is operational authority for current/future individual lessons;
- Student lifecycle reads/writes — canonical;
- Guest lifecycle — canonical;
- Admin / Planner lifecycle — canonical;
- Instructor lesson list/history/completion — canonical;
- proposals / change requests — canonical;
- resource claims / scheduling changes — canonical;
- legacy Booking realtime sync disabled;
- active reachable legacy Booking lifecycle writers = 0;
- legacy recommendation writer remains only in dead/unreachable code;
- recommendation editor temporarily removed from Instructor Workspace;
- completion goes through canonical `record_booking_attendance`;
- legacy `scheduledAutoCompleteBookings` removed from source export and deleted from production;
- legacy Individual Booking lifecycle callables deleted from production (see inventory below).

##### T32.9A.9A.F1 — Canonical Admin Guest Payment Capture — PASS / DEPLOYED

Goal: Administrator must have a canonical way to record money actually received from a guest for an individual lesson.

Required behavior:

```text
Guest Booking
  → Admin opens Booking
  → sees required amount / paid amount / remaining amount
  → «Зафиксировать оплату»
  → canonical finance/payment command
  → Payment remains numeric authority
  → full funding leads to canonical guest confirmation
```

Explicit rules:

- no legacy guest wallet authority;
- no direct Booking status patch;
- no dual write;
- KZT only;
- idempotent real-money write;
- audit required;
- server-side authorization;
- partial payment semantics follow current Payment domain ([ADR-0003](adr/0003-payment-accounting-source.md));
- payment success must not be reported as failure if confirmation is temporarily delayed;
- confirmation/reconciliation remains canonical ([ADR-0007](adr/0007-guest-identity-payment-and-confirmation.md)).

F1 is implemented and deployed to production. Admin guest lesson payment capture uses canonical `record_provider_payment_event` through `executeCanonicalCommand` on the Admin lesson Booking detail surface (`AdminLessonBookingDetail` / `useAdminLessonBookingCommands`). F1 is **PASS / DEPLOYED**.

##### T32.9A.9A.F2 — Guest Unpaid Reservation Expiry — PASS / CLOSED

Goal: an unpaid guest individual Booking must not hold instructor/resource slots indefinitely.

Implemented facts (not newly invented policy):

- Command: existing `expire_guest_reservation` (server/system only). Scheduler is orchestrator only.
- Scheduler: `scheduledExpireGuestLessonReservations`, cadence `every 5 minutes`, timezone `UTC`.
- Authoritative deadline field: `Booking.lifecycle.reservationExpiresAt`.
- Created at guest lesson creation by `resolveGuestLessonReservationExpiresAt`: `min(createdAt + GUEST_LESSON_RESERVATION_TTL_MS, serviceStartsAt)` where TTL = 1 hour.
- Clock: server authoritative time. Inclusive boundary: `now >= reservationExpiresAt` is expired.
- Eligibility: guest origin, `pending`, Payment exists and matches Booking identity, Payment is not `isPaymentFullyFundedForService`, deadline reached.
- Lifecycle: `pending` → `cancelled` with `reasonCode: 'reservation_expired'`.
- Partial payment does not protect the reservation; Payment amounts are not refunded, retained, written off, or deleted by expiry.
- Payment after deadline is rejected by the F1 guest acceptance predicate even if the scheduler has not run yet.
- Fully funded pending Booking after `reservationExpiresAt` is a confirmation/reconciliation case, not unpaid expiry, while service has not started. Expiry returns `fully_funded`; reconciliation confirms and retains the claim.
- Resource claims are released once per Booking via `planReleaseBookingClaims` (one instructor occurrence claim, not per participant as the expiry authority).
- No expiry notification/outbox obligation. Audit: `activity_logs` with `scheduled_system_action`.
- Candidate query: guest + pending + `lifecycle.reservationExpiresAt.seconds <= now`, ordered by that seconds field then `bookingId`, page size 25, max 100 per invocation.
- F3 compatibility: expiry authority is the Booking aggregate. No `participantIds.length === 1` assumption. Payment.price is not recomputed from participant count.

**Limbo policy resolution (accepted).** Prior ambiguity: Payment fully funded, Booking `pending`, `now >= reservationExpiresAt`, service not started — expiry skipped the Booking, confirmation/reconciliation did not confirm, resource claim stayed active. Canonical policy:

- `reservationExpiresAt` governs unpaid reservation hold and new funding acceptance, not delayed reconciliation of an already fully funded Booking;
- `pending` + fully funded + service not started → eligible for canonical confirmation/reconciliation even after the reservation deadline; claim retained;
- `pending` + not fully funded + deadline passed → `cancelled` / `reservation_expired`; claim released;
- late funding after deadline → rejected server-side; no Payment mutation; no resurrection;
- fully funded + `pending` + past deadline must not remain a permanent canonical state — reconciliation must confirm when invariants are satisfied.

F2 does not introduce `fullyFundedAt`, a new event timestamp policy, or funding-time inference from `Payment.updatedAt`.

Requirements covered:

- use the existing canonical expiry policy/command (`expire_guest_reservation` / `reservationExpiresAt` domain policy);
- scheduler is orchestrator only, not a direct status writer;
- expired unpaid guest reservation releases resource claims;
- funded/confirmed Booking must never be incorrectly expired;
- payment vs expiry race must be safe;
- confirmation reconciliation vs expiry must be safe;
- bounded scheduler;
- indexed query;
- idempotent processing;
- no legacy scheduler/write.

Do not invent a new TTL in this document. Use the existing domain reservation-expiry policy already encoded by canonical Booking lifecycle. Concrete duration belongs to that policy, not to a migration invention.

**F3 compatibility requirement.** F2 does not implement multi-participant lesson booking. F2 remains **F3-compatible**: expiry is a lifecycle operation over the Booking/Payment reservation aggregate, not over a single Participant. After F3, one Booking still has one expiry decision, one lifecycle transition, one slot release, and one Payment outcome — regardless of participant count.

F2 production manual smoke and final 9A integration smoke are recorded **PASS / CLOSED** (2026-09-10).

##### T32.9A.9A.F3 — Canonical Multi-Participant Lesson Booking — PASS / CLOSED

Goal: support booking one individual/private lesson for several managed Participants in a single canonical lesson reservation.

**Delivered scope boundary.** Multi-participant creation is available only for canonical authenticated/managed Participants. Guest lesson creation still accepts exactly one guest Participant/contact. F3 does not introduce several guest profiles, a multi-guest identity contract, multi-guest linking/claim semantics, or several guest contacts inside one Booking. This restriction exists only at the guest creation boundary: the canonical `Booking` aggregate and all Booking-level lifecycle, Payment, expiry, cancellation, and reconciliation workflows remain party-size independent over `participantIds[]`.

Aggregate semantics:

```text
several Participants
        ↓
ONE Lesson Booking
```

This is **not** several independent Bookings. A canonical lesson reservation represents one instructor lesson in one time slot with multiple participants.

**Canonical invariants** for multi-participant lesson:

```text
1 Lesson Booking
1 instructor/time-slot reservation
1 Booking lifecycle
1 Payment
1 cancellation workflow
N Participants
```

When selecting Participants A + B:

```text
Booking
  participantIds = [A, B]
```

Not:

```text
Booking A
Booking B
```

for the same slot. Do not create separate instructor slot locks, Payments, or Booking lifecycles per Participant. One instructor occurrence claim reserves the lesson; each Participant additionally receives the existing conflict claim needed to prevent that Participant from being double-booked.

**Participant model.** Canonical direction: `Booking.participantIds[]` must support at least `[A]` and `[A, B]` and is the source of truth for new canonical lesson writes. Do not document a specific migration implementation for legacy `participantId` until a code/schema audit defines a safe cutover/compatibility strategy.

Product/domain invariant: **multi-participant Booking cannot be represented by only the first `participantId`.** The following is forbidden as canonical truth for multi-participant lesson:

```text
participantId = participantIds[0]
```

**Frontend participant selection** (preserve approved semantics):

```text
participants.length === 1
→ picker hidden
→ participant determined automatically
→ booking submit uses its participantId

participants.length >= 2
→ show multi-select Participant Picker
→ user may select multiple Participants
→ booking submit uses full effectiveParticipantIds[]
```

Existing derived-state baseline:

```text
single participant → [singleParticipantId]
multiple participants → selected valid participant IDs
```

`0 participants` is not a normal product flow. It is a transitional/error state (loading, provisioning incomplete, read-model/provisioning error).

**CourseEnrollment — do not change.** Lesson and Course differ:

```text
Lesson:  Participants A + B → ONE Booking → participantIds = [A, B]
Course:  Participants A + B → Enrollment A + Enrollment B
```

CourseEnrollment remains a separate canonical enrollment per Participant. F3 must not merge multiple CourseEnrollments into one aggregate.

**Pricing rule.** Lesson total:

```text
totalPrice =
  baseLessonPrice
  + additionalParticipantSurchargePerHourKzt
    × (participantCount - 1)
    × lessonDurationMinutes / 60
```

for `participantCount >= 1`:

```text
1 participant, any duration → baseLessonPrice
2 participants, 60 min, surcharge 5000 → baseLessonPrice + 5000
2 participants, 90 min, surcharge 5000 → baseLessonPrice + 7500
3 participants, 90 min, surcharge 5000 → baseLessonPrice + 15000
2 participants, 30 min, surcharge 5000 → baseLessonPrice + 2500
```

Do not fix a concrete additional-participant fee amount in this document.

**Admin-configurable lesson settings.** The delivered canonical singleton `/lesson_pricing_settings/lesson_booking` contains `additionalParticipantSurchargePerHourKzt` and `maxParticipantsPerLesson`. Administrator changes use `update_lesson_pricing_settings`, expected-revision OCC, mandatory reason, server validation, idempotency, and immutable audit. The maximum is a positive safe integer with no hardcoded business upper bound or implicit default. The UI reads both values only for preview, picker, and validation UX; the booking transaction reads the current setting and remains final authority. Duration is taken from the canonical lesson/Booking schedule, not from a frontend total. New authenticated creation fails closed when the aggregate is absent or invalid. Guest creation remains its separate single-participant boundary.

**Server price authority.** Frontend may show estimated/display price; authoritative Booking cost is determined by backend. The canonical command uses base lesson price, participant count, canonical lesson duration, and current canonical additional-participant hourly surcharge to calculate total server-side. Frontend does not pass authoritative final price.

**Pricing snapshot.** Admin setting changes after Booking creation must not change cost of existing bookings. F3 requires Booking/Payment to retain sufficient immutable pricing snapshot / monetary facts to prove:

```text
base lesson price
+ surcharge per hour
+ duration
+ participant count
+ settings revision
= authoritative charged price
```

The delivered Booking pricing basis is `lesson_party:v1` with base lesson price, snapshotted per-hour surcharge and settings revision, lesson duration, Participant count, and calculated total. Payment retains numeric original/current price authority. A later Administrator setting change therefore affects only future creation; existing Booking/Payment facts do not drift.

**Authorization.** On multi-participant Booking creation, backend must verify authorization/ownership/managed-participant access for **every** `participantId`. If A is authorized and B is not, the whole command must fail atomically — no partial Booking.

**Atomicity.** Multi-participant lesson creation must be atomic relative to: Booking; slot reservation/occupancy; Payment; Wallet debit if applicable; participant relations/claims; idempotency; relevant ActivityLog/outbox effects. No partial results (Booking created but second Participant not attached; double debit; two slot locks).

**Cancellation.** Multi-participant lesson has one Booking and one shared lifecycle. F3 does not introduce per-Participant cancellation by default:

```text
cancel Booking → entire lesson reservation cancelled
```

Removing one Participant from an existing group lesson booking, if needed later, is a separate explicitly designed workflow — not a hidden part of F3.

**Attendance compatibility.** F3 must be compatible with participant-level attendance semantics. One Booking may have `participantIds = [A, B]` while attendance differs per participant (`A → present`, `B → absent`). Do not collapse multi-participant attendance to a single participant status. F3 need not redesign Attendance, but Booking/read-model architecture must not block per-participant attendance. **F4** implements the Instructor per-participant Attendance UX and operational path on top of this F3-compatible architecture; F4 does not change F3 Booking aggregates.

**Read models / UI.** F3 must update all lesson Booking read surfaces that assume `one Booking == one Participant`. Audit: client booking history; upcoming lessons; Instructor panel; Admin Lesson Booking; Admin Planner; booking monitor; participant-specific views; notifications; cancellation UI; Payment presentation; attendance UI; activity/audit presentation. UI must display all Participants of a Booking.

**Idempotency.** Replaying the same canonical create-booking command with the same idempotency intent must not create a second Booking, re-reserve slot, re-create Payment, re-debit Wallet, or lose/duplicate Participants.

**Maximum participant count.** `maxParticipantsPerLesson` in canonical Admin lesson settings is the business authority for new authenticated/managed Booking creation. There is no hardcoded Booking-schema business maximum. Creation validates the current setting inside the same authoritative transaction after Participant access checks and before Booking, Payment, Wallet, or claim writes. An existing Booking remains valid if the maximum is later reduced; its Payment/pricing snapshot and lifecycle remain unchanged, and reschedule with the same `participantIds[]` remains allowed. A composition addition applies the current maximum. Independently, the transaction planner may reject an operation that exceeds ADR-0002 technical read/write/payload budgets.

**Acceptance criteria.** F3 is complete only when proven:

| Scenario              | Expected outcome                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single participant    | Picker hidden; ONE Booking; `participantIds` contains A; ONE Payment; ONE slot reservation                                                                      |
| Two participants      | Select A + B; ONE Booking; `participantIds` exactly [A, B]; ONE Payment; ONE slot reservation                                                                   |
| Three participants    | Select A + B + C; ONE Booking; per-hour surcharge applied twice and scaled by duration; ONE Payment; ONE slot reservation                                       |
| Configurable maximum  | Current max admits parties up to that value; an over-max or forged request is rejected atomically with zero Booking/Payment/claim writes                        |
| Guest boundary        | A guest creation request with more than one Participant is rejected before Booking/Payment creation; authenticated multi-participant creation remains available |
| Authorization         | A allowed + B not allowed → whole command rejected; no partial Booking/Payment/slot mutation                                                                    |
| Pricing               | 2 participants → base price + one additional-participant fee                                                                                                    |
| Admin pricing setting | Admin changes fee → future bookings use new fee; existing bookings retain old financial truth                                                                   |
| Admin maximum setting | Admin reduces max → future oversized bookings fail; existing larger Booking and same-party reschedule remain valid                                              |
| Idempotency           | Same booking command replay → no duplicate Booking/Payment/debit/slot reservation                                                                               |
| Cancellation          | Multi-participant Booking cancelled → one canonical cancellation; slot released once; financial policy applied once                                             |
| Read models           | All affected lesson Booking read models show full participant set                                                                                               |
| Course regression     | CourseEnrollment multi-select still creates independent enrollment per Participant                                                                              |

F3 source, unit, Firestore Emulator, local browser E2E, and manual acceptance evidence are complete. The slice is **PASS / CLOSED**.

**F4 dependency.** F3 records the Booking/Payment/slot aggregate for multiple Participants. F4 completes the Instructor Attendance operational path F3 requires. F4 does **not** redesign F3 monetary, slot, or booking-aggregation semantics.

##### T32.9A.9A.F4 — Canonical Multi-Participant Lesson Attendance UX — PASS / CLOSED

Goal: expose canonical factual Attendance to the assigned Instructor **per frozen service participant** for both individual lesson Booking and F3 `family_group` / multi-participant lesson Booking.

F4 does **not** redesign F3 Booking. One canonical Booking may contain multiple frozen `serviceParticipantIds`. Attendance remains a separate canonical aggregate per participant occurrence (`attendance:v1:booking:{occurrenceId}:{participantId}` per [ADR-0004](adr/0004-attendance-outcome-and-admin-issue-model.md)).

**Resolved gaps (pre-F4; documented as fixed, not current defects).**

1. `InstructorBookingCard` rendered `booking.participants[]` but the attendance action targeted only `booking.participantId` (effectively the first participant).
2. The action was lifecycle-oriented (“complete lesson”) and hardcoded `attendanceStatus = present`.
3. Instructor lesson Booking read models had no current Attendance status/revision/authorized-action projection per participant.
4. For `family_group`, one `present` could derive `Booking.lifecycle = completed`, after which existing authorization prevented the Instructor from filling missing Attendance for remaining participants.
5. Old attendance command idempotency identity was designed for a one-way “complete” action and could collide across factual corrections.
6. A `family_group` Booking could disappear from the Instructor `confirmed` filter after the first `present` even while remaining participants still needed Attendance.

**Canonical Attendance model (unchanged by F4).**

Stored Attendance statuses remain only `present` and `absent`. Missing Attendance document means **not recorded** — missing factual evidence. It is **not** `absent`, `present`, `no_show`, or `completed`.

F4 did **not** introduce: explicit `unknown` status; a booking-level attendance field; frontend direct Attendance Firestore writes; or legacy `completeBooking` lifecycle mutation. Attendance remains factual evidence. Booking lifecycle remains server-derived.

**Instructor read-model extension.**

Instructor scopes (`instructor_hot`, `instructor_history`) on `queryLessonBookingReadModels` now expose an optional top-level per-participant Attendance projection (`LessonBookingInstructorAttendancePresentation` in `lessonBookingReadModel.ts`):

```text
attendance: [
  {
    participantId,
    attendanceStatus?: 'present' | 'absent',
    revision?: number,
    authorizedActions: {
      canRecordPresent: boolean,
      canRecordAbsent: boolean
    }
  }
]
```

Semantics:

- every frozen `serviceParticipantId` is represented;
- missing Attendance → `attendanceStatus` and `revision` omitted together (schema-enforced pair);
- status and revision are loaded from canonical Attendance;
- `authorizedActions` are server-derived via `evaluateInstructorBookingAttendanceActions` / `bookingAttendancePolicy.ts`;
- Instructor list projection does not expose Admin-only correction reason/provenance unless already allowed elsewhere.

Admin continues to use `admin.attendance` on the Admin detail projection. Other read scopes remain contract-compatible.

**Instructor UX after F4.**

The Booking-level action “Mark completed” / “Complete lesson” was removed from Instructor lesson cards. Attendance is shown and acted on **per participant**.

For every rendered participant:

| Attendance state | Label        | Actions                                 |
| ---------------- | ------------ | --------------------------------------- |
| Not recorded     | Not recorded | Present / Absent when authorized        |
| Present          | Present      | Absent only when correction authorized  |
| Absent           | Absent       | Present only when correction authorized |

Submitting state is participant-specific (`instructorLessonAttendanceSubmissionId`). After success the canonical read model is refetched; the UI renders server-confirmed Attendance with no authoritative optimistic Attendance state.

**Frontend command contract.**

Conceptual helper: `recordLessonAttendance(...)` in `useBookingCollaborationCommands.ts` (replaces the old `recordLessonCompleted(...)` concept).

Input:

```text
{
  bookingId,
  participantId,
  attendanceStatus,
  expectedAttendanceRevision?
}
```

Canonical command:

```text
kind: record_booking_attendance
exercisedCapability: instructor
```

`record_booking_attendance` is **not** a standalone Firebase Function. It executes through `executeCanonicalCommand`. The frontend authenticated command surface is `executeCanonicalCommand`. The read-model callable is `queryLessonBookingReadModels`. Do **not** document a deploy target `functions:record_booking_attendance`.

**Revision / OCC semantics.**

- Missing Attendance → omit `expectedAttendanceRevision`.
- Changing existing Attendance → send exact current Attendance `revision`. The client does not invent revisions.
- On `stale_version` → refetch authoritative state; do not blindly replay the correction; the user may retry deliberately.

**Idempotency.**

Semantic attempt identity (`deriveRecordInstructorAttendanceIdempotencyKey`):

```text
attendance:{bookingId}:{participantId}:{attendanceStatus}:{expectedAttendanceRevision|missing}
```

Invariants:

- duplicate retry of the same deliberate action reuses the same identity;
- `missing → present` and later `present → absent` cannot collide;
- idempotency is not keyed by `bookingId` alone.

**`family_group` terminal Attendance policy (domain clarification).**

For `family_group` Booking, Attendance remains independent for every frozen `serviceParticipantId`. Example:

```text
A → present
→ server may derive Booking.lifecycle = completed
```

Even after Booking is terminal `completed`, the assigned Instructor may still, inside the existing Instructor Attendance window (`endsAt + 24h` per ADR-0004), **add missing** Attendance for remaining frozen participants when doing so does not change the already-derived terminal lifecycle (`instructorMayFillMissingFamilyGroupAttendanceOnTerminal`).

Example:

```text
A = present, Booking = completed
→ Instructor records B = absent, C = present
→ A = present, B = absent, C = present, Booking remains completed
```

**Terminal safety boundary (fail-closed).**

For terminal `family_group` Booking the Instructor may fill **currently missing** participant Attendance when server policy determines the projected lifecycle remains the current terminal lifecycle.

The Instructor may **not**:

- generically rewrite terminal Booking lifecycle;
- correct existing terminal `family_group` Attendance if that could undermine or alter the terminal outcome;
- perform `completed ↔ no_show` terminal corrections (Admin-controlled per existing Attendance correction policy).

Participant must belong to frozen `serviceParticipantIds`. All authorization remains server-side.

**Confirmed-filter retention rule (presentation only).**

Without special handling, a `family_group` Booking that becomes `completed` after the first `present` would leave the Instructor `confirmed` filter while B/C still need Attendance.

F4 adds `isInstructorBookingVisibleForStatusFilter` / `hasOutstandingInstructorLessonAttendance`: a `completed` Booking may remain visible on the Instructor `confirmed` view while at least one participant still has a server-authorized Attendance action. This does **not** fake or override lifecycle — `Booking.lifecycle` remains `completed`. The UI only keeps the item reachable while outstanding Attendance work remains.

**Auto-present policy — out of scope.**

F4 does **not** implement automatic `present` after 24 hours. If the Instructor does not record Attendance during the allowed window, missing Attendance remains missing; the system does not invent `present` or `absent`. Existing `missing_attendance` / AdminIssue policy remains authoritative. F4 does **not** change the existing 24-hour Instructor Attendance window.

**Lesson outcome finalization and Instructor routing.**

Deterministic lesson outcomes resolve at `endsAt`, not at `endsAt + 24h`:

- `>=1 present` → `completed`
- all absent → `no_show`
- `0 present + any missing` → remain `confirmed` / unresolved

Attendance recorded before `endsAt` is evidence only until `endsAt`. After `endsAt`, `scheduledResolveLessonBookingAttendanceOutcomes` invokes existing `resolve_attendance_outcome` (no duplicated calculator). Same-status Instructor `record_booking_attendance` on a still-`confirmed` Booking also reaches the calculator so a post-`endsAt` correction path can finalize if needed.

Instructor read routing (`isInstructorLessonBookingHot`):

- `ended + confirmed` stays in `instructor_hot` through `endsAt + 24h` (operational “Not recorded” / remaining Attendance actions);
- after resolution (`completed` / `no_show`) the Booking moves to `instructor_history`;
- after `endsAt + 24h`, unresolved `confirmed` leaves the operational view for history / Admin `missing_attendance`.

Instructor history follows the same page-cursor drain as `instructor_hot` (default page size 25). The first page is not a silent universe cap.

**Courses — unchanged.**

F4 is lesson-Booking-specific. CourseDay Attendance, `CourseEnrollment.attendanceSummary`, course attendance commands, course attendance UX, and course lifecycle policy are unchanged.

**Legacy boundary.**

F4 does **not** restore or use: legacy `completeBooking` lifecycle path; direct frontend `updateDoc` on canonical Booking lifecycle; or direct frontend Attendance Firestore writes.

`completeBookingService` / `completeBookingViaCallable` remain elsewhere in the repository for non-Instructor legacy paths and are **not** the current Instructor Attendance path. Unused i18n keys such as `instructorCompleteLesson` are cleanup/deferred, not active Instructor behavior.

**Historical data.**

Historical legacy lesson/training records do not need Attendance backfill. No new requirement to migrate historical attendance. Old legacy training/lesson history may be removed according to the accepted cutover policy (9D).

**Verified automated evidence (2026-09-09 worktree).**

| Suite                                                                                                                                                                               | Result                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend F4 unit (`instructorLessonAttendanceCard`, `instructorWorkspaceCanonical`, `bookingCollaborationIntegration`, `bookingCollaborationViewModels`, `bookingAttendancePolicy`) | 32 passed                                                                                                                                  |
| Shared-domain `lessonBookingReadModel.test.ts`                                                                                                                                      | 11 passed                                                                                                                                  |
| Functions `bookingAttendanceCommands.test.ts` + `lessonBookingReadModels.test.ts`                                                                                                   | 33 passed (23 + 10)                                                                                                                        |
| Functions `bookingAttendanceCommands.emulator.test.ts`                                                                                                                              | 20 tests present; skipped without Firestore emulator in the documentation verification run — execute via `npm run test:functions:emulator` |
| `tests/firestore.rules.test.ts`                                                                                                                                                     | 67 tests present; not re-executed in this documentation session                                                                            |
| i18n parity (`translationsParity.test.ts`)                                                                                                                                          | 2 passed                                                                                                                                   |
| `npx tsc --noEmit` (app)                                                                                                                                                            | pass                                                                                                                                       |
| `functions` `tsc --noEmit` + build                                                                                                                                                  | pass                                                                                                                                       |
| `npm run build` (app)                                                                                                                                                               | pass                                                                                                                                       |
| `npm run i18n:check`                                                                                                                                                                | pass                                                                                                                                       |

Do not mark F4 `PASS / CLOSED` from automated tests alone; production manual smoke for F4 is recorded **PASS** as part of T32.9A.9A final integration / production smoke (2026-09-10).

**Production manual smoke (recorded PASS).**

Individual:

- missing → present;
- missing → absent.

Family/group (`A`, `B`, `C` all start Not recorded):

- `A → present` → Booking becomes `completed`;
- `B` / `C` remain reachable on the Instructor lesson list;
- `B → absent`, `C → present` → Booking remains `completed`.

Confirmed filter:

- Booking remains reachable on `confirmed` while `B` / `C` still have server-authorized Attendance actions.

**Deployment surfaces.**

F4 backend changes require deployment of:

1. `executeCanonicalCommand` — `record_booking_attendance` handler/policy executes through the canonical authenticated command callable.
2. `queryLessonBookingReadModels` — Instructor Attendance projection changed.

Frontend changes require Firebase Hosting.

No Firestore rules/index deployment is required unless rules/index files change for this slice.

```bash
npx firebase deploy --only functions:executeCanonicalCommand,functions:queryLessonBookingReadModels
npx firebase deploy --only hosting
```

Do **not** deploy `functions:record_booking_attendance` — no such standalone callable exists.

F4 is **PASS / CLOSED** after production manual acceptance and final 9A integration smoke (2026-09-10).

##### T32.9A.9A final integration / production smoke — PASS

Gate after F2 + F4 (with F1 `PASS / DEPLOYED` and F3 `PASS / CLOSED` already recorded). Confirms end-to-end individual Booking lifecycle cutover (including guest payment capture, unpaid reservation expiry, multi-participant lesson booking, and per-participant Instructor Attendance) on production smoke paths before 9A closes and 9B begins.

Recorded **PASS** in production (2026-09-10). T32.9A.9A overall remains **PASS / CLOSED** for the original F1–F4 scope. Guest course reservation automatic expiry is tracked under **T32.9A.9A.F5** (see below), now **PASS / CLOSED**. 9B and the later slices through 9E / T32.9A are also **PASS / CLOSED**; the next accepted slice is **T32.9B / T39**.

##### T32.9A.9A.F5 — Canonical Guest Course Reservation Expiry — PASS / CLOSED

T32.9A.9A.F5 was added after the original T32.9A.9A production close when a separate guest CourseEnrollment lifecycle/runtime gap was identified. The prior F1–F4 acceptance remains valid. F5 never invalidated completed Individual Booking lifecycle work. Bounded scheduler, unreachable legacy source removal, production deploy/inventory, and the production expiry smoke are all done: F5 is **PASS / CLOSED** (production expiry smoke PASS, 2026-09-16). The `BLOCKED_ONLY_BY_PRODUCTION_EXPIRY_SMOKE` records above and the acceptance-criterion note below are the dated state before that smoke.

**Previous gap (not a schema redesign).** Canonical guest CourseEnrollment already supported guest origin, `pending` lifecycle, canonical Payment, authoritative `reservationExpiresAt`, seat reservation, resource claims, payment-driven confirmation, and canonical `expire_guest_reservation` behavior for CourseEnrollment subjects (`expireGuestCourseEnrollmentReservation`). It lacked a bounded production scheduler export, so a guest CourseEnrollment that was `pending`, not fully funded, and past `reservationExpiresAt` could remain active and continue occupying course capacity until explicitly handled.

`scheduledExpireGuestLessonReservations` is lesson-Booking-only. It must not be read as handling CourseEnrollments.

**Canonical target flow.**

```text
Guest CourseEnrollment created
        ↓
pending
reservationExpiresAt set
Payment created
seat reserved
resource claims active
        ↓
 ┌─────────────────────────────┐
 │                             │
Payment fully funded       deadline reached
 │                       while not fully funded
 ▼                             ▼
canonical confirmation      bounded scheduler
 │                             ↓
confirmed                expire_guest_reservation
                               ↓
                          cancelled
                               ↓
                         claims released
                               ↓
                  seat/capacity restored
                  exactly once when allowed
```

Preserved invariants:

- Payment remains confirmation authority; identity linking does not confirm; partial payment does not confirm.
- Scheduler is orchestration only; canonical command owns lifecycle mutation.
- Fully funded subjects must not be expired by unpaid-reservation expiry.
- Terminal `cancelled` subjects must never be resurrected.
- Capacity and resource claims must not be released twice; retries must be idempotent.
- `reservation deadline != confirmation authority`: a fully funded pending CourseEnrollment after the reservation deadline follows canonical confirmation/reconciliation rules when still eligible; it must not be blindly cancelled only because the deadline passed.

**Reservation deadline / TTL (existing policy — do not invent).**

```text
Lesson Booking:
  min(createdAt + GUEST_LESSON_RESERVATION_TTL_MS, serviceStartsAt)   // TTL = 1 hour

CourseEnrollment:
  min(createdAt + GUEST_COURSE_RESERVATION_TTL_MS, course.startAt)    // TTL = 24 hours
```

Authoritative field: `CourseEnrollment.lifecycle.reservationExpiresAt`, set at guest enrollment creation via `resolveGuestCourseReservationExpiresAt` (`packages/shared-domain/src/canonical/courseEnrollmentCreation.ts`). Inclusive boundary: `now >= reservationExpiresAt`.

**Three enrollment financial/lifecycle cases (F5 does not redefine admin debt).**

| Case                                        | Behavior                                                                                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated self-service CourseEnrollment | Insufficient Wallet → command rejected; no enrollment; no seat reservation. No normal unpaid self-service path.                                                                                                                                           |
| Guest CourseEnrollment                      | May exist as `pending` + not fully funded + seat reserved + claims active + `reservationExpiresAt` until fully funded → `confirmed` or deadline → canonical expiry → `cancelled` / `reservation_expired` with seat/claim release when domain rules allow. |
| Admin-created underfunded CourseEnrollment  | May intentionally remain financially underfunded under existing canonical admin rules. F5 guest reservation expiry does not apply.                                                                                                                        |

**Partially funded expiry.** Partial payment does not protect the guest reservation (same unpaid-hold semantics as F2). F5 does not decide refund percentage, retention, write-off, Wallet credit, or provider refund on expiry — expiry/lifecycle and financial resolution remain within already accepted canonical policy. Payment amounts are not mutated by reservation expiry. Broader partially-paid guest cancellation/refund policy remains explicitly deferred per T32.8C.

**Bounded background reads (deployed; production expiry smoke PASS, 2026-09-16).** F5 does not scan every CourseEnrollment, every Payment, all unpaid Payments, or perform unbounded collection walks. `scheduledExpireGuestCourseReservations` runs every 5 minutes in UTC with `maxInstances: 1`, 256 MiB, and Gen 1 CPU. Its candidate query shape is:

```text
guest origin + pending + reservationExpiresAt <= now
```

The query uses page size 25, maximum 100 candidates per invocation, and an `(reservationExpiresAt.seconds, enrollmentId)` cursor. The required composite index is `attribution.bookingOrigin ASC, lifecycle.status ASC, lifecycle.reservationExpiresAt.seconds ASC, enrollmentId ASC`. Structured scheduler logs expose `scannedCandidates`, `expired`, `fullyFunded`, `alreadyTerminal`, `alreadyIneligible`, `stale`, `invalidIntegrity`, `failed`, `pages`, and `truncated` without PII.

**Scheduled idempotency keys.** Deterministic, compact, stable keys within canonical length limits (`buildScheduledCommandIdempotencyKey` pattern). Do not use oversized concatenated keys; a prior production issue involved oversized scheduled idempotency keys.

**Legacy `createGuestCourseEnrollment` audit — REMOVED from the release candidate.**

| Artifact                                                      | Current classification                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `functions/src/courses/createGuestCourseEnrollment.ts`        | **REMOVED** — no production caller; export removed from `functions/src/index.ts`                                 |
| `src/features/courses/createGuestCourseEnrollmentCallable.ts` | **REMOVED** — no imports/callers; active UI uses `executeGuestCanonicalCommand` with `create_course_enrollments` |

The caller audit found no frontend/server production invocation of the legacy callable. The active `CourseEnrollmentModal` path already used `useCourseEnrollmentCommands.createGuestEnrollment`, canonical `create_course_enrollments`, and persisted canonical guest linking/cancellation credentials, so no UX migration was needed before removal. Production inventory (2026-09-14 independent `functions:list` on `ski-school-8f3ca`) confirms the previously deployed callable is **ABSENT**; it is no longer an F5 blocker.

Final invariants:

- Production has exactly one authoritative guest CourseEnrollment creation path.
- No reachable production guest CourseEnrollment creation path may create an indefinite `pending` reservation without an authoritative reservation deadline.

**F5 acceptance criteria (PASS / CLOSED only when all hold).**

1. Guest canonical CourseEnrollment has authoritative `reservationExpiresAt`.
2. Expired pending not-fully-funded guest enrollments are discovered automatically in production.
3. Discovery is bounded and paginated.
4. Existing canonical expiry command behavior is reused (`expire_guest_reservation` → CourseEnrollment handler).
5. Fully funded reservations are not expired.
6. Payment-vs-expiry race is safe.
7. Terminal cancellation cannot be resurrected.
8. Seat capacity is restored exactly once where domain rules allow.
9. Relevant resource claims are released exactly once.
10. Repeated scheduler runs are idempotent.
11. No unbounded background read exists.
12. Read cost is observable.
13. Scheduled idempotency keys remain within canonical bounds.
14. Legacy `createGuestCourseEnrollment` reachability is resolved (`REMOVED` or `MIGRATED_AND_REMOVED`).
15. No active production path can create indefinite guest `pending` enrollment without TTL.
16. Focused unit/emulator tests pass. **PASS in release candidate.**
17. Production deploy succeeds. **PASS (2026-09-14 inventory).** `scheduledExpireGuestCourseReservations` ACTIVE; `createGuestCourseEnrollment` ABSENT; Cloud Scheduler every 5 minutes UTC; observed executions healthy (`scannedCandidates: 0`, `expired: 0`, `failed: 0`).
18. Production runtime smoke verifies expected behavior. **PASS (2026-09-16).** The observed blocker was that no expired candidate appeared in the scheduler window (source TTL is 24 hours, `GUEST_COURSE_RESERVATION_TTL_MS`; `expire_guest_reservation` is system/scheduler-only via `assertExpireGuestReservationAuthorization`; the guest callable allowlist does not include it; the emulator sweep injects `now` while the production scheduler does not; no admin/test path may backdate `reservationExpiresAt`; and a course starting within 24h is not a valid seat-release smoke because `shouldReleasePreStartSeatOnTerminalization` is false after `course.startAt`). A real ordinary guest flow then produced an unpaid `pending` guest CourseEnrollment whose `reservationExpiresAt` passed while pre-start seat release was still allowed, and the following scheduler run expired it with the expected lifecycle, seat, claim, and replay outcomes recorded below.

**Production inventory (ski-school-8f3ca, independent re-list 2026-09-14).**

| Function | Production |
| -------- | ---------- |
| `createGuestCourseEnrollment` | **ABSENT** — not a blocker |
| `executeGuestCanonicalCommand` | **ACTIVE** (callable) |
| `scheduledExpireGuestCourseReservations` | **ACTIVE** (scheduled, us-central1, 256MiB, nodejs20) |
| Cloud Scheduler job | **ENABLED**, every 5 minutes UTC (executions 17:21–18:31Z observed) |

**Production expiry smoke (ordinary guest flow; read-only observation after create) — PASS 2026-09-16.**

The procedure below is the recorded smoke that was executed and passed; it is retained because it documents exactly what was verified. It did not write Firestore by console, invoke `expire_guest_reservation` from a callable, deploy, or delete.

1. Choose a production Course whose `startAt` is **strictly more than 24 hours** from now, so `reservationExpiresAt = createdAt + 24h` and expiry happens while pre-start seat release is still allowed. Record `courseId` and `capacity.availableSeats`. Record one existing **confirmed** enrollment id on that course or another course as the funded/confirmed control (must remain confirmed).
2. Logged-out public home → group course card → guest enroll tab in `CourseEnrollmentModal` (name + phone required). Do **not** pay. Creation path must be `executeGuestCanonicalCommand` / `create_course_enrollments`.
3. Record before-expiry: `enrollmentId`, `paymentId`, `lifecycle.status = pending`, `lifecycle.reservationExpiresAt`, `courses/{courseId}.capacity.availableSeats` (expect −1 vs step 1), `resource_claims` with `ownerId = enrollmentId` and active `course_seat_pre_start` + `participant_course_day_enrollment`.
4. Wait until `now >= reservationExpiresAt`, then the next scheduler run (`scheduledExpireGuestCourseReservations`, every 5 minutes UTC).
5. After: enrollment `lifecycle.status = cancelled`, `reasonCode = reservation_expired`; availableSeats restored exactly +1; those claims `lifecycle.status = released`; Payment amounts unchanged.
6. Replay: the following scheduler run must not expire/release again (`scannedCandidates` excludes this id or classifies already-terminal; availableSeats unchanged; claims remain released).
7. Control: the confirmed enrollment from step 1 remains `confirmed`.

**Outcome: PASS (2026-09-16).** Every recorded expectation above held on the production project, so F5 is **PASS / CLOSED**. Before this smoke the criterion was `BLOCKED_ONLY_BY_PRODUCTION_EXPIRY_SMOKE`; that label is now historical and must not be restated as the current status.

**Downstream cutover gate (satisfied).** With F5 **PASS / CLOSED**, canonical guest course lifecycle may be treated as production-complete for:

- **T32.9A.9P** — PASS / CLOSED; the guest course payment/expiry/reachability inventory rows and the legacy `createGuestCourseEnrollment` classification are no longer held open by F5.
- **T32.9A.9D0 / T32.9A.9D** — 9D physical source cleanup is **PASS / CLOSED**; production Function deletions remain inventory-gated and were not executed in 9D.
- **T32.9A.9E** — global reachability may now claim complete guest course reservation expiry; the production Function-delete inventory remains a separate gate.
- Final production decommission of `createGuestCourseEnrollment`: the deployed name is already **ABSENT** (2026-09-14 inventory) and its source is removed from this release candidate.

F5 never blocked unrelated completed slices (F1–F4, 9B, 9C, 9P, 9D0), and its closure does not reopen them.

#### Production Booking inventory (ski-school-8f3ca) — PASS

Read-only inventory result for Individual Booking cutover:

| Classification             | Count |
| -------------------------- | ----- |
| CANONICAL_CURRENT_FUTURE   | 16    |
| LEGACY_ONLY_CURRENT_FUTURE | 0     |
| CANONICAL_PAST             | 1     |
| LEGACY_PAST_DISPOSABLE     | 11    |
| AMBIGUOUS                  | 0     |

Interpretation:

- current/future legacy-only Booking blockers = 0;
- ambiguous Booking docs = 0;
- current/future Booking migration/backfill NOT required;
- 11 leftover historical Booking docs may be deleted later in T32.9A.9D only if the 9P/9D0 manifest still classifies them disposable and they have no protected messages or other 9P-preserved children;
- historical legacy lesson/booking history is disposable;
- NO historical backfill required.

Document IDs are omitted here; inventory tooling lives under `scripts/individual-booking-cutover-inventory.mjs`.

#### Production legacy Individual Booking functions cleanup

After production cleanup, these **legacy Individual Booking lifecycle** functions are removed:

- `addBooking`
- `cancelBooking`
- `completeBooking`
- `confirmBooking`
- `createBooking`
- `createGuestBooking`
- `deleteBooking`
- `linkGuestBooking`
- `requestBookingCancellation`
- `scheduledAutoCompleteBookings`
- `updateBookingSchedule`

Production remains on canonical functions, including:

- `executeCanonicalCommand`
- `executeGuestCanonicalCommand`
- `queryLessonBookingReadModels`
- `queryBookingProposalReadModels`
- `queryBookingChangeRequestReadModels`
- and other canonical read models

This is **not** a claim that every legacy function in the project was removed — only the legacy Individual Booking lifecycle surface above.

#### Background jobs (Booking-related)

| Job                                                          | Status                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduledAutoCompleteBookings`                              | Removed (source export + production)                                                                                                                    |
| `scheduledReconcileGuestConfirmationMismatches`              | Canonical / active                                                                                                                                      |
| `scheduledPurgeExpiredNotifications`                         | Canonical / active                                                                                                                                      |
| Guest unpaid reservation expiry scheduler (lesson Booking)   | `scheduledExpireGuestLessonReservations` — Canonical / active (`every 5 minutes`, UTC; production-smoked under 9A.F2)                                   |
| Guest unpaid reservation expiry scheduler (CourseEnrollment) | `scheduledExpireGuestCourseReservations` — Canonical / active (**F5 PASS / CLOSED**; `every 5 minutes`, UTC; deployed and running; production expiry-semantics smoke PASS 2026-09-16)                |

Do not confuse completion scheduling with payment-confirmation reconciliation. Do not assume the lesson reservation scheduler expires CourseEnrollments.

#### T32.9A.9B — Student Booking Stats / Progress / Recommendations Cutover — PASS / CLOSED

Mandatory scope:

- instructor recommendations;
- lesson feedback;
- student individual lesson stats;
- student history-derived progress;
- streaks;
- today checklist;
- related individual lesson achievement inputs;
- completed recommendation IDs, if they remain product-relevant after domain review;
- **Reviews / Instructor Rating Continuity** (see below).

Product decision:

```text
Recommendation / feedback / progress
must NOT be auto-added as fields on canonical Booking.

First determine the correct canonical progress/feedback authority.
```

During 9A, recommendation editing is temporarily disabled in Instructor Workspace.

In 9B:

- create or use the correct canonical authority;
- canonical write command(s);
- canonical read model;
- authorization / OCC / idempotency;
- restore Instructor recommendation editor;
- provide Student canonical read UX;
- active legacy recommendation writes = 0;
- no dual write;
- complete Reviews / Instructor Rating Continuity so Student Cabinet no longer depends on legacy Booking implementation for reviews.

This slice is documentation of required migration scope. It does not implement 9B.

##### T32.9A.9B.2 — Canonical Participant Progress

**Status: PASS / CLOSED** — production deploy **PASS** (Functions → Hosting → Firestore Rules, no data migration) and manual acceptance smoke **PASS** on **2026-09-11**.

Product Owner decision (2026-09-11): **legacy student progress is NOT migrated.**

###### Authority

Canonical authority:

```text
/participant_progress/{participantId}
```

Progress belongs to **Participant**, not Account/User. Supported Participant kinds:

- self Participant (Account Owner as attendee);
- dependent / child Participant **without** their own `/users` document.

Empty start for every Participant (missing document = no canonical history yet):

```text
level = 1
skillScores = {}
skillComments = {}
revision = 0 / no document until first canonical update
```

Legacy fields on `/users/{uid}`:

```text
level
skillScores
skillComments
```

→ **not** authority  
→ **not** migrated  
→ canonical progress starts **clean**  
→ legacy fields remain **cleanup candidates** until later migration phases (e.g. T32.9B physical cleanup)  
→ **no** frontend fallback to legacy progress

Data migration: **NO**. Do not run production dry-run/apply.

###### Student Cabinet — managed Participant selection (final policy)

- **1** managed Participant → auto-select.
- **2+** with self → **self** selected on initial load only.
- After manual selection, selection **persists**; refetch of progress/participants does **not** reset selection.
- Selected Participant removed from managed set → fallback to **self** when self exists; otherwise empty (no `participants[0]` guess).
- **2+** without self → **no** `participants[0]` fallback; user must choose explicitly.
- Switching is fully **SPA** (no full page reload).
- Navbar / LevelUpModal remain **self-specific** and do **not** drive cabinet progress Participant selection.

###### Instructor progress

- Instructor works against a specific **participantId**, including dependents without their own Account.
- Progress identity is always **participantId**, never Account `uid` alone.
- **Active InstructorRelationship** is a separate **global** basis for progress read/write access; it does **not** depend on Attendance on a particular lesson Booking.
- **Booking-scoped** evidence (below) is an additional path when no qualifying relationship applies.

###### Lesson-context assessment gate (Instructor booking card)

Per **Participant** on that lesson card (not shared across party members):

| Attendance for that Participant | «Оценить» + level controls |
| ------------------------------- | -------------------------- |
| missing (no record)             | disabled                   |
| `present`                       | enabled                    |
| `absent`                        | disabled                   |

One Participant marked `present` does **not** enable assessment for another Participant on the same Booking.

###### Backend booking-based progress evidence (Instructor)

Without active InstructorRelationship, booking-based evidence must qualify. Rules are **participant-specific** (another Participant’s Attendance never grants authority). UI lesson gate and this backend policy are **aligned**.

| Booking lifecycle      | Attendance for target Participant | Time (confirmed)    | Instructor progress via booking evidence |
| ---------------------- | --------------------------------- | ------------------- | ---------------------------------------- |
| `confirmed`            | missing                           | any                 | DENY                                     |
| `confirmed`            | `absent`                          | any                 | DENY                                     |
| `confirmed`            | `present`                         | before `startsAt`   | DENY                                     |
| `confirmed`            | `present`                         | at/after `startsAt` | ALLOW                                    |
| `completed`            | `present`                         | —                   | ALLOW                                    |
| `completed`            | missing / `absent`                | —                   | DENY                                     |
| `no_show`              | any                               | —                   | DENY                                     |
| `pending`              | any                               | —                   | DENY                                     |
| `pending_cancellation` | any                               | —                   | DENY                                     |
| `cancelled`            | any                               | —                   | DENY                                     |

Shared-domain policy: `bookingProvidesInstructorProgressEvidence` / `participantProgressAccessPolicy` (tests in `participantProgressAccessPolicy.test.ts`).

###### Closure (9B.2) — PASS

Production deploy (no migration step) — **PASS**:

```text
1. Functions
2. Hosting
3. Firestore Rules
```

Manual acceptance smoke — **PASS** (2026-09-11): Student multi-participant selection, dependent progress, Instructor lesson gate, canonical commands/read models.

##### T32.9A.9B.3 — Recommendations / Lesson Feedback continuity — PASS / CLOSED

**Status: PASS / CLOSED** (2026-09-12) — production deploy and manual acceptance smoke **PASS**. Canonical Lesson Feedback is **not** Chat Homework; homework remains a separate preserved capability (see **T32.9A.9P.HW1**).

Does not subsume **Reviews / Instructor Rating Continuity** (separate mandatory 9B scope below) or **T32.9A.9B.4** Stats / Achievements.

###### Authority

Canonical authority:

```text
/participant_lesson_feedback/{feedbackId}
identity = participantId + lessonBookingId
```

Supported Participant kinds:

- self Participant (Account Owner as attendee);
- dependent / child Participant **without** their own `/users` document.

Empty start for every Participant/lesson (missing document = no canonical feedback yet). Legacy data is **not** migrated.

Legacy fields on `/bookings/{bookingId}`:

```text
recommendations
completedRecommendationIds
```

```text
→ not authority
→ not migrated
→ canonical feedback starts clean
→ leftover production fields remain selective cleanup candidates for 9P / 9D
→ no frontend fallback to Booking recommendation fields
→ no dual-write into Booking recommendation fields
```

Instructor write: canonical command `save_participant_lesson_feedback` via `executeCanonicalCommand`.
Student/Guardian completion: canonical command `set_participant_lesson_feedback_item_completion`.
Student/Instructor reads: canonical read models via `queryParticipantLessonFeedbackReadModels`.

###### Instructor gate

Per **Participant** on that lesson card (not shared across party members):

| Attendance for that Participant | Recommendations / lesson feedback editor |
| ------------------------------- | ---------------------------------------- |
| missing (no record)             | disabled                                 |
| `present`                       | enabled                                  |
| `absent`                        | disabled                                 |

- **No** InstructorRelationship bypass for this write. Attendance=`present` is the instructor write gate.
- One Participant marked `present` does **not** enable feedback for another Participant on the same Booking.
- A/B isolation: feedback for A is not visible/editable as B’s aggregate.

###### Student / Guardian

- Cabinet Participant selection (self/child) drives which canonical feedback is loaded.
- Surfaces: Latest, Today, Coach, History, Lesson Details, Needs Attention.
- Completion toggle uses the canonical command; Guardian completion is allowed for managed Participants.
- Switching A → B does not leak A’s items; switching back keeps A intact.

###### Chat Homework — out of scope / preserved

Canonical Lesson Feedback ≠ Chat Homework.

Chat Homework remains a separate live capability:

```text
bookings/{threadId}/messages
isHomework
homeworkForUserIds
```

9B.3 does **not** migrate Chat Homework and must not delete chat/homework with Booking parents. Participant-scoped homework targeting is a **known 9P parity gap** tracked as **T32.9A.9P.HW1** (not part of ParticipantLessonFeedback). The former ChatWindow recommendation strip was a ghost leftover after canonical cutover (cabinet chat bookings do not carry `Booking.recommendations`) and was removed without touching messages/homework.

###### 9B.4 — implemented after 9B.3

9B.3 left stats/achievements as the next sub-slice. That work is recorded in **T32.9A.9B.4** below. History still **displays** historical `recommendation_completed` / `recommendations_completed_all` / `booking_completed` / `achievement_earned` activity-log rows when they exist; those types remain presentation-only.

###### Legacy isolation (9B.3E)

After 9B.3E cleanup:

- Instructor reachable legacy recommendation writer = 0
- Instructor reachable legacy recommendation reader = 0
- Student Cabinet reachable legacy recommendation writer = 0
- Student Cabinet reachable legacy recommendation reader = 0
- Canonical → Booking.recommendations fallback = 0
- Canonical → completedRecommendationIds fallback = 0
- Canonical → legacy recommendation service call = 0
- Dual-write to Booking = 0
- Rules: legacy recommendation direct writes remain CLOSED (`bookings/{id}` client updates cannot write those fields; `/participant_lesson_feedback` is callable-only)

Dead recommendation-only code removed in 9B.3E (zero reachable callers): `InstructorRecommendationsEditor`, `LessonRecommendationsList`, `lessonRecommendations.ts` helpers, `saveBookingRecommendationsService`, `toggleRecommendationService` / `useBookingActions.handleToggleRecommendation`, inert `GroupCourseCard` recommendation indicator, unused `getInstructorRecommendations`.

###### Closure (9B.3) — PASS

Production deploy (no migration step) — **PASS** (2026-09-12):

```text
1. Firestore indexes (participant_lesson_feedback composite) — READY
2. Functions: executeCanonicalCommand, queryParticipantLessonFeedbackReadModels
3. Firestore Rules
4. Hosting
```

Migration: **NO**. Schedulers: **NO**. Settings: **NO**. Legacy Booking recommendations migration: **NO**.

Manual acceptance smoke — **PASS** (2026-09-12):

| Check                                                                                              | Result         |
| -------------------------------------------------------------------------------------------------- | -------------- |
| Canonical authority `/participant_lesson_feedback/{feedbackId}`                                    | PASS           |
| Identity `participantId + lessonBookingId`                                                         | PASS           |
| Instructor feedback: Attendance=`present` per Participant only; InstructorRelationship bypass = NO | PASS           |
| Student/Guardian canonical reads                                                                   | PASS           |
| Canonical completion (Student/Guardian toggle)                                                     | PASS           |
| Multi-participant isolation                                                                        | PASS           |
| Dependent without `/users`                                                                         | PASS           |
| Clean start (no legacy migration)                                                                  | PASS           |
| Legacy Booking recommendations migration                                                           | NO (by design) |
| Legacy recommendation readers/writers reachable                                                    | 0              |
| Booking dual-write                                                                                 | 0              |
| Legacy fallback to Booking recommendation fields                                                   | 0              |

```text
T32.9A.9B.3 → PASS / CLOSED
T32.9A.9B.4 → PASS / CLOSED
```

##### T32.9A.9B.4 — Stats / Achievements — PASS / CLOSED

**Status: PASS / CLOSED** — production deploy and authenticated manual smoke passed. Implementation through 9B.4E isolation/cleanup/integration gate remains the accepted source closure.

9B.4 does **not** canonicalize Course metrics. Course progress / hours / `course_graduate` remain **T32.9A.9C**. Chat Homework remains **T32.9A.9P.HW1**. Activity logs remain presentation/history only.

###### Authority

Student lesson stats (Season lessons/hours, Coach lesson count / last attended lesson):

```text
selectedParticipantId
+ canonical managed Participant Attendance (Attendance.present)
+ complete account lesson history drain (account_hot ∪ account_history)
```

Absence is Attendance.absent for that participantId. Missing attendance is not learning credit. Booking lifecycle `completed`, `booking.userId`, `participants[0]`, first-participant fallback, first history page only, and `useBookingsStore.bookings` are **not** reachable Student stats authority.

Participant achievements:

```text
/participant_achievements/{participantId}
```

Evaluation sources:

| Signal                   | Authority                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------- |
| lessons / hours / streak | Participant Attendance.present                                                        |
| skill / level            | `/participant_progress/{participantId}`                                               |
| homework_done            | ParticipantLessonFeedback (all checklist items completed)                             |
| persisted badges         | `/participant_achievements/{participantId}`                                           |
| feedback_given           | canonical reviews (account-level; not participant persistence)                        |
| course_graduate          | 9C PASS / CLOSED — participant-scoped, server-only from CourseEnrollment completed in the same transaction; once-earned; no backfill; no synthetic `course_*` Booking workaround |

Instructor metrics (one Booking = one lesson/slot; not per Participant):

```text
completed = lifecycle completed
no_show = lifecycle no_show
occupied = completed OR no_show
source = instructor_hot ∪ instructor_history (revision-merged)
```

Admin operational KPIs:

```text
active = current admin_hot operational snapshot (confirmed | pending_cancellation)
completed / no_show / occupied = lifetime admin_hot ∪ admin_history
revenue = canonical finance (unchanged)
```

Admin/Instructor KPIs do **not** use `isAttendedLessonStatus`, `deletedCompletedStats`, `school_global_stats`, `Booking.price`, or Participant Attendance as a business-lifecycle proxy.

###### History / activity logs

`studentHistory.ts` still uses `isAttendedLessonStatus` and legacy activity-log types (`booking_completed`, `recommendation_completed`, `recommendations_completed_all`, `achievement_earned`) to **label** timeline events. That is presentation-only. It is not Student stats or achievement truth.

No new Stats/Achievement logic uses activity logs as authority. No new generic `activity_logs` writes were added.

###### Full history strategy

Cursors terminate (`drainPagedReadModelItems` rejects missing/repeating cursors). Hot ∪ history rows are revision-deduped. Student stats drain is module-coordinated (in-flight reuse per account). Do **not** treat first-page history as complete.

**Authority (unchanged by T32.9R):** Student lesson stats / achievement evaluation still require complete Attendance-present evidence from account lesson history (`account_hot` ∪ `account_history` drain). That is intentional capability authority for 9B.4, not a temporary optimization target to delete.

Read-cost notes:

- At 9B.4 close, Student cabinet on `/` and `/cabinet*` ran first-page list scopes **and** a full history drain for stats/achievements. **T32.9R.P0A/P0B** later moved `account_hot` ownership to consuming surfaces and made post-command lesson refresh surface-aware, so only history-owning surfaces (`/cabinet/history`, `/cabinet/profile_journey`) pay for `account_history`; see **T32.9R.P0B**. The stats/achievement history drain authority above is unchanged and runs only on its own surfaces with its own freshness TTL.
- **T32.9R.P0C** audited Home: history-derived Attendance evidence remains required for “New achievements today” / achievement recorder → verdict `HOME_STATS_REQUIRED_R2`. Do not remove Home stats ownership as a temporary optimization.
- **T32.9R.R2** (maintained participant lesson stats projection) is **DEFERRED** — not required before cutover unless production history-read cost becomes material.
- Instructor workspace drains `instructor_hot` ∪ `instructor_history`.
- Admin Operations drains `admin_hot` ∪ `admin_history` in addition to monitor surfaces that already page those scopes.

###### Legacy isolation (reachable authority = 0)

- Student stats leftover authority (`Booking.status === completed` as attendance, `booking.userId`, `participants[0]`, first-page-only, `useBookingsStore.bookings`) = 0
- Achievements leftover authority (`useBookingsStore.bookings`, `/users` progress fallback, `Booking.recommendations`, `completedRecommendationIds`, `booking_completed` / `recommendation_completed` log authority) = 0
- Instructor KPI leftover authority (`isAttendedLessonStatus`, Attendance-as-lifecycle) = 0
- Admin KPI leftover authority (`deletedCompletedStats`, `school_global_stats` fetch, `Booking.price`, Attendance-as-lifecycle) = 0

Frontend no longer fetches or stores `deletedCompletedStats` / `users/school_global_stats` for Admin KPI. Production Firestore data for `school_global_stats` is **not** deleted here (selective cleanup later). Identity hygiene still excludes that doc from user directories (`starterCredit`, `useUsersSync`). Admin reset/clear tools and legacy Functions `bookingLogic` may still write that doc as a live leftover capability — reported, not guessed-deleted.

###### Closure (9B.4) — PASS / CLOSED

```text
T32.9A.9B.4 → PASS / CLOSED
Production deploy + authenticated manual smoke → PASS
```

Production deploy and authenticated manual smoke are complete. Indexes: **NO** (no `firestore.indexes.json` change in the cumulative 4B–4E diff). Migration: **NO**. Settings: **NO**. Schedulers: **NO**.

The remaining mandatory 9B source gate was **Reviews / Instructor Rating Continuity** (unnumbered; there is no accepted ticket `T32.9A.9B.5`). Its production deploy and authenticated manual smoke are complete. With 9B.2, 9B.3, and 9B.4 also closed, the numbered next slice after 9B overall is **T32.9A.9C**.

##### Reviews / Instructor Rating Continuity — PASS / CLOSED

**Status: PASS / CLOSED** — production deploy and authenticated manual smoke passed. Reachability proof is: legacy review write = 0; legacy review read = 0; legacy rating fallback = 0; dual-write = 0.

###### Canonical authority and write path

```text
Student Cabinet eligible Review CTA / modal
→ createCanonicalInstructorReview
→ executeCanonicalCommand
→ create_instructor_review
→ one transaction creates /instructor_reviews/{reviewId}
  and creates/updates /instructor_rating_summaries/{instructorId}
```

The client intent contains only `bookingId`, integer `rating` 1..5, and optional trimmed `comment` (maximum 1000). It cannot supply `instructorId` or `participantId`; the server derives the Instructor and participant party from canonical Booking. Command failure propagates to the form and does not show success. A post-commit read refresh failure is reported and retried separately without misreporting the already-committed mutation as failed.

Server eligibility is exactly:

```text
Booking.lifecycle.status = completed
AND caller is the active managing Account for the entire Booking party
AND client exercisedCapability matches the party authorities
AND at least one Participant in the frozen service party has a canonical,
    identity-matching Attendance with attendanceStatus = present
AND Instructor is derived from Booking.occurrence.instructorId
```

`pending`, `confirmed`, `pending_cancellation`, `cancelled`, `no_show`, absent Attendance, missing Attendance, wrong Account, mismatched Attendance identity, and spoofed Instructor input fail closed. For a multi-participant Booking, two present plus one absent still permits exactly one Account-level Review; all absent/missing denies it. An unrelated Participant cannot contribute Attendance evidence.

###### One Review and rating-summary invariants

`reviewId = hash(bookingId + managingAccountId)` is deterministic. The Review document and Instructor summary are written in the same Firestore transaction. Same-key replay returns the stored outcome; a different-key concurrent duplicate races on the same deterministic Review document, then retries to `already_exists`. Exactly one Review is created and the summary count/rating sum/distribution increments once.

`/instructor_rating_summaries/{instructorId}` is the only runtime rating/count authority. `/instructors.rating`, `/instructors.reviewsCount`, `/instructors.ratingCounts`, and legacy `/reviews` are ignored. Missing summary maps to `rating = null`, `reviewsCount = 0`, and no-review UI. Instructor cards, picker, course instructor presentation, Student Coach ordering, public reviews modal, and Instructor dashboard consume the canonicalized presentation.

###### Read models, account scope, and resource bound

`queryInstructorReviewReadModels` exposes `public_summaries`, cursor-paginated `instructor_reviews`, and authenticated exact-ID `account_reviews`. Public and Instructor review feeds load one page of 25 at a time and expose an explicit Load more action; they never auto-drain full Instructor history. A malformed canonical review fails the page instead of being silently skipped across a cursor boundary. `account_reviews.bookingIds` is required, non-empty, deduplicated/chunked by the client, and bounded by `INSTRUCTOR_REVIEW_ACCOUNT_BOOKING_IDS_MAX`; it cannot trigger an account-history scan. Optional transport `idempotencyKey` is accepted for every scope. Every authenticated Account role, including Admin in the client cabinet, hydrates the projection; callable authorization remains Account/management based rather than profile-role based. Account review identity is deterministic per Booking/Account, remains reviewed after reload, and is cleared with user-scoped stores on auth session changes. A failure in any account chunk rejects the whole projection, so callers preserve prior/unknown state and post-write refresh schedules retry instead of merging incomplete authority.

###### Rules and legacy reachability

Direct client reads/writes for `/instructor_reviews` and `/instructor_rating_summaries` are denied; public and account reads go through the callable. Direct legacy `/reviews` reads/writes are also denied. Production `/reviews` data is not deleted, migrated, or backfilled here.

```text
reachable legacy review WRITE paths = 0
reachable legacy review READ paths = 0
reachable legacy rating fallback paths = 0
dual-write paths = 0
```

Dead zero-caller legacy helpers removed: `addReviewService`, the legacy Firestore review subscription/write helpers, `useBookingActions.handleAddReview`, `toReview`, `BookingsState.setReviews`, and `selectReviews`. The compatibility UI `Review` shape remains presentation-only and is populated exclusively from canonical read models; it is not a legacy data source.

Production deploy and authenticated manual smoke are complete. Migration: **NO**. Settings: **NO**. Schedulers: **NO**.

###### Closure (9B) — PASS / CLOSED

All accepted mandatory 9B capabilities are closed:

- 9B.2 Canonical Participant Progress;
- 9B.3 Recommendations / Lesson Feedback continuity;
- 9B.4 Stats / Achievements;
- Reviews / Instructor Rating Continuity.

`T32.9A.9B.5` is not an accepted roadmap ticket. Course metrics and `course_graduate` are **T32.9A.9C PASS / CLOSED**; participant-scoped Chat Homework remains the separate 9P.HW1 parity item. Neither is an open 9B blocker.

```text
T32.9A.9B → PASS / CLOSED
T32.9A.9C → PASS / CLOSED
T32.9A.9A.F5 → PASS / CLOSED (production expiry smoke PASS 2026-09-16)
T32.9A.9D → PASS / CLOSED (physical source cleanup 2026-09-16)
T32.9A.9E → PASS / CLOSED (2026-09-17)
T32.9A → PASS / CLOSED (2026-09-17)
T32.9B → PASS / CLOSED (2026-09-18)
T39 → PASS / CLOSED (2026-09-18; exact 4 documents)
NEXT → T40 Execute Rehearsed Selective Production Cutover
#42 account_hot page-1 reconciliation >25 remains a recorded T32.9R follow-up
```

#### T32.9R — Firestore / server-resource optimization (parallel track)

**Authoritative optimization status.** Parallel to T32.9A.9 cutover; does not gate or replace **T32.9A.9C**. Prefer measured concrete waste over speculative secondary projections. Historical discovery audits: [`.scratch/firestore-read-audit-2026-09-12.md`](../.scratch/firestore-read-audit-2026-09-12.md), [`.scratch/t32.9a.r.1-firestore-read-cost-audit.md`](../.scratch/t32.9a.r.1-firestore-read-cost-audit.md) (superseded as roadmap; retained as audit evidence).

Status columns are separate on purpose: **Implementation PASS** does not imply **DEPLOYED** or **RUNTIME VERIFIED**.

##### Strategic decision

1. Optimize measured, concrete read waste first.
2. Do not build major secondary projections merely for theoretical future scale.
3. After remaining READY items are deployed and runtime-verified, re-measure production Firestore / Functions usage before selecting the next optimization.
4. **R1** and **R2** are intentionally deferred architecture — not the next mandatory coding tickets.

##### Status table

| Ticket | Problem | Accepted state | Implementation | Deploy / runtime | Notes |
| ------ | ------- | -------------- | -------------- | ---------------- | ----- |
| BG1 / BG1A | Guest confirmation reconciliation scheduler unbounded fully-paid Payment scan; starvation of already-open issues | Bounded candidate scanning; unbounded fully-paid Payment scan removed; open-issue starvation fixed | PASS | DEPLOYED / RUNTIME VERIFIED | Scheduler read bounding |
| BG2 / BG2A | Attendance outcome scheduler reread of confirmed-ended bookings | Projection `booking_attendance_outcome_work`; deadlines `endsAt` and `endsAt+24h`; semantic-diff guard; backfill `scannedBookings=47`, `created=47`, `blocked=0`, `migrationReady=true` | PASS / MIGRATED | DEPLOY-RUNTIME-VERIFICATION-PENDING | Do not claim runtime verified for `syncLessonBookingAttendanceOutcomeWork` without post-Eventarc deploy evidence in-repo |
| UI1 | Trainer participant-instructor access request loop | Stable per-query loaded/loading/error; query key `scope+participantId+instructorId`; revoked/null are valid loaded; no render-loop refetch | PASS | READY_FOR_DEPLOY (no separate deploy record here) | Root cause: unstable `useBookingCollaborationCommands()` effect dependency |
| UI1B | Trainer remount cleared `participantAccessQueries` via full `store.reset()` | Collaboration list may reset independently; access loaded state survives Trainer↔Training/Home; clears on logout/account switch; mutation invalidation explicit | PASS | READY_FOR_DEPLOY | Target: first Trainer mount = 2 calls for two keys; remounts = 0; mutation on A = +1 for A only |
| P0A | Catastrophic lesson read amplification containment | No eager `account_history` from root/cabinet; timer/visibility stats drain removed; history/stats ownership moved toward consuming surfaces; `account_hot` remained temporary hot refresh | PASS (containment) | Historical containment accepted | Do not rewrite historical P0A intent |
| P0B | Global `/cabinet*` 30s `account_hot` polling | Hypothesis **NOT CONFIRMED** — no periodic 30s timer polled `account_hot`; surface scoping was already present. Implemented instead: post-command lesson refresh is surface-aware, so only history-owning surfaces pay for `account_history`; `/cabinet/profile_journey` fixed as a history-owning surface | PASS | READY_FOR_DEPLOY (frontend/hosting; no deploy record here) | Original problem statement superseded. Public `/` must not re-add `account_hot` for review-badge discovery (separate deferred issue) |
| P0B-PRUNE | `account_hot` page-1 reconciliation prune for accounts with >25 hot bookings | `findStaleHotLessonBookingIds` treats "absent from `hotItems`" as stale, and `hotItems` is only the first `account_hot` page (25), so valid hot items can leave the local store. Deliberately **not fixed** by the P0B refresh narrowing | OPEN — recorded follow-up | N/A | Requires a read-contract decision (drain pages before pruning, prune only the fetched window, or id-scoped invalidation). Must not introduce an unbounded/eager history read. See [`.scratch/canonical-booking-domain-rewrite/issues/42-account-hot-page1-reconciliation-prune.md`](../.scratch/canonical-booking-domain-rewrite/issues/42-account-hot-page1-reconciliation-prune.md) |
| P0C | Home `account_history` ownership audit | Home needs lesson-derived Attendance evidence for New achievements today / achievement recorder; not general Home progress/XP UI | AUDITED | N/A | Verdict: `HOME_STATS_REQUIRED_R2` — do not strip Home stats ownership |
| A1 | `queryParticipantInstructorAccessReadModels` post-UI1 waste | One legitimate `account_manager` path still did full management topology + duplicate entity reads | AUDITED | N/A | Verdict: `ACCESS_OPTIMIZATION_RECOMMENDED` → addressed by A2 |
| A2 | Bound pair authorization for access read | Targeted `accountId+participantId+active` management query; no full topology / sibling fan-out; reuse preloaded docs; ~11+ → bounded 7 reads; cost independent of family size | PASS | READY_FOR_DEPLOY | Index: `participant_management` `accountId ASC, participantId ASC, status ASC` |
| R1 | True physical Firestore pagination for `account_history` | Blocked: no queryable history-visibility projection; membership uses lifecycle/`endsAt` vs public `updatedAt` ordering incompatibility | DEFERRED / BLOCKED | N/A | Do not build visibility projection now; revisit only if production metrics justify |
| R1A | Logical pagination cursor tie-break bug | For equal `updatedAt`, `bookingId ASC` → rows after cursor use `bookingId > cursor.bookingId` | PASS | READY_FOR_DEPLOY | Public cursor schema / logical ordering unchanged |
| R2 / R2A | Maintained participant lesson stats projection | Exact achievement `earnedAt` needs chronological order statistics; counters-only insufficient; unbounded lifetime evidence array unacceptable | DEFERRED | N/A | Leave Home history stats path; revisit only if production history-read cost is material. Not a launch/cutover gate unless an older authoritative roadmap already required it (none does) |
| M1 | Lesson-booking management topology `limit(50)` + in-memory active filter | Active-only query + physical pages by `participantManagementId` (page size 50 ≠ domain max); inactive history cannot starve; `getAll`/request memo for participants | PASS | READY_FOR_DEPLOY | Verdict was `ACTIVE_MANAGEMENT_UNBOUNDED`. Index: `accountId ASC, status ASC, participantManagementId ASC`. Consumers: lesson/course enrollment/attendance, proposals, change requests, instructor reviews |
| M2 | Managed participant picker `limit(50)` starvation | Reuses `ReadModelRequestContext.allActiveManagementForAccount`; same M1 index/paging; public picker still sorts by displayName | PASS | READY_FOR_DEPLOY | >50 active participants supported; inactive history does not consume query rows |

##### T32.9R.P0B — lesson-booking post-command read optimization — completed

**Original hypothesis: NOT CONFIRMED.** P0B was opened as "global `/cabinet*` 30-second `account_hot` polling". Audit found no periodic 30-second timer polling `account_hot`, and surface scoping was already present: `shouldSyncAccountLessonBookings` limited `account_hot` ensure/visibility refresh to routes that render current/upcoming lessons (`/cabinet`, `/cabinet/home`, `/cabinet/calendar`, `/cabinet/coach`, `/cabinet/instructors`), and unrelated cabinet tabs such as Training never owned the hot read. The recorded problem statement is superseded; the timer/polling framing must not be restated as an implemented fix.

**Implemented optimization — remove unnecessary `account_history` reads after commands.** Post-command lesson-booking refresh is now **surface-aware**:

```text
normal cabinet surfaces (Home / Calendar / Coach / instructors / Training)
  → account_hot-only refresh after create / cancel

/cabinet/history and /cabinet/profile_journey (history-owning surfaces)
  → hot + account_history refresh (first page, freshness-gated)
```

- `resolveLessonBookingCommandRefreshStrategy` derives the refresh from the active pathname and is wired in `CabinetRouteContainer`; the commands hook never reads router state itself and keeps `account_hot`-only as its default (`refreshAccountLessonBookingsHotOnly`).
- Only `/cabinet/history` and `/cabinet/profile_journey` pay for the `account_history` read (`refreshAccountLessonBookingsWithHistory`), which also keeps an admin-approved `pending_cancellation → cancelled` transition visible without a reload.
- The post-command recovery refetch (`refetchAccountHotBookings`) is deliberately `account_hot` only; no caller depends on the former `account_history` side effect.
- Read-model scopes, payloads, page size, cursors, and authorization are unchanged. `reconcileHot: true` is preserved deliberately.

**Fixed: `/cabinet/profile_journey` cold-entry history ownership.** Journey renders completed-lesson events directly (limited preview plus "Show all"), and `completed` lessons are never members of `account_hot`. `shouldSyncAccountLessonHistory` now includes `/cabinet/profile_journey`, so a cold Journey entry loads its own history instead of depending on warm hot data — Journey is a **history-owning surface**, not merely a hot consumer.

**Freshness TTLs are independent.** `ACCOUNT_LESSON_BOOKING_FRESH_MS` (`syncAccountLessonBookings`) gates `account_hot` ensure/visibility. `ACCOUNT_PARTICIPANT_LESSON_STATS_FRESH_MS` (`useAccountParticipantLessonStatsSync`) gates the participant lesson-stats drain that feeds Student lesson stats/achievements. They are separate constants on purpose: the stats drain is far more expensive and must not be coupled to the cheap hot window.

**Recorded follow-up (out of P0B scope): >25 `account_hot` page-1 reconciliation prune.** `findStaleHotLessonBookingIds` treats "absent from `hotItems`" as stale, and `hotItems` is only the first `account_hot` page (25), so an account with more than 25 concurrent hot bookings can lose valid hot items locally until a deeper read repopulates them. The P0B narrowing preserves `reconcileHot: true` and does not change this behaviour. It needs a separate read-contract decision and its own read-cost analysis; see [issue 42](../.scratch/canonical-booking-domain-rewrite/issues/42-account-hot-page1-reconciliation-prune.md) and the `P0B-PRUNE` row above.

##### Deferred issues (out of current optimization scope)

These are not regressions introduced by T32.9R tickets:

1. **Public-home review badge discovery** — `account_hot` cannot discover completed lessons. Predates/independent of P0B. Needs a completed/review-eligible discovery source; do not re-enable `/` on hot paths for the badge.
2. **`account_hot` page-1 reconciliation prune (>25 hot bookings)** — `P0B-PRUNE`; recorded, not fixed by the post-command refresh narrowing.
3. **R1 physical pagination** — deferred (schema/order incompatibility; would need maintained account-history visibility projection + writers/backfill + clock-driven transitions).
4. **R2 ordered evidence / stats projection** — deferred (correction-aware achievement `earnedAt` needs chronological evidence infrastructure without an unbounded lifetime array).

##### Current next step (optimization track)

1. Deploy / runtime-verify remaining **READY_FOR_DEPLOY** and **DEPLOY-RUNTIME-VERIFICATION-PENDING** items (especially BG2 `syncLessonBookingAttendanceOutcomeWork` after any Eventarc failure, plus A2/M1/M2 indexes and callables, UI1/UI1B/P0B hosting as needed).
2. Re-measure production Firestore / Functions usage.
3. Choose the next optimization from measured cost — do not manufacture a coding ticket merely to keep the roadmap busy.

#### T32.9A.9C — Course Progress / Achievements Cutover — PASS / CLOSED

**9C.A semantic foundation accepted 2026-09-14.** Course Progress means curriculum
progress (`elapsedDays / scheduledDays`), where a CourseDay becomes elapsed only at its canonical
`endsAt`. `recordedDays`, `presentDays`, `absentDays`, `missingDays`, Attendance coverage, and
Attendance rate are separate metrics and Attendance coverage must not be presented as Course
Progress. The derived participant/enrollment-scoped `CourseProgressPresentation` is not persisted.

Course completion remains the existing CourseEnrollment lifecycle authority: after the final
CourseDay, any current-occurrence `present` resolves to `completed`, all required days absent
resolves to `no_show`, and missing evidence leaves `confirmed` with `missing_attendance`.
Schedule progress at 100% never completes an Enrollment.

`course_graduate` is participant-scoped, server-only, earned once from the canonical Enrollment
transition to `completed`, with `earnedAt = lifecycle.completedAt` and source
`course_completion`. Synthetic Course Booking, Activity Log, progress percentage, and legacy data
are not evidence. 9C.A defined the shared contract; 9C.D implements issuance.

The required CourseDay set freezes at the first canonical CourseEnrollment. Before the first
Enrollment existing CourseDay mutation rules apply; afterward `create_course_day` rejects the
addition because every current CourseDay is required. Optional/supplemental days need a future
explicit capability. Decision: [ADR-0009](adr/0009-course-progress-and-required-day-freeze.md).

Course outcome scheduler semantics reuse `resolve_attendance_outcome` and the accepted 24-hour
Attendance deadline. 9C.B creates bounded, ordered Enrollment work with
`dueAt = finalCourseDayEndsAt + 24h`; an unbounded CourseEnrollment scan is forbidden.

**9C.B READY_FOR_9C.C (2026-09-14; no deploy or migration performed).** Account Enrollment reads now
query `course_enrollments` by authorized `participantId` (`==` for a selected Participant, `in`
batches of at most 30 for the account-level surface) and order by `updatedAt.seconds DESC`,
`updatedAt.nanoseconds DESC`, `enrollmentId ASC`. Every physical page uses Firestore `startAfter`;
the cursor advances by the last server-ordered Enrollment inspected even when `account_hot` /
`account_history` membership filters it from the returned page. This removes the hidden
`limit(100)` universe without introducing a full history drain. `selectedParticipantId` is accepted
only after exact active ParticipantManagement topology authorization.

`CourseEnrollmentReadModel.courseProgress` derives at request time from the verified CourseDay
schedule, server/reference `now`, and current-occurrence Attendance. One account page performs one
bounded Attendance `in` query for at most 25 Enrollment IDs; Course and CourseDay reads are reused
per Course by the request context. No CourseProgress aggregate or persisted percentage exists.

Server-only `course_enrollment_outcome_work/{enrollmentId}` is synchronized by
`syncCourseEnrollmentOutcomeWork` on canonical Enrollment writes. Confirmed Enrollment work is due
at final CourseDay `endsAt + COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS`; pending guest reservations
and terminal rows do not create new work. `scheduledResolveCourseEnrollmentOutcomes` runs every five
minutes, reads at most 26 work docs (25 candidates plus look-ahead) ordered by `dueAt.seconds ASC`,
`enrollmentId ASC`, and invokes the existing `resolve_attendance_outcome` command. Success closes
work, lifecycle-ineligible rows close as no-op, invalid rows block, and transient failures use
bounded exponential retry. Existing deterministic `missing_attendance` identities are reused.

Indexes added: `course_enrollments(participantId ASC, updatedAt.seconds DESC,
updatedAt.nanoseconds DESC, enrollmentId ASC)` and
`course_enrollment_outcome_work(status ASC, dueAt.seconds ASC, enrollmentId ASC)`. The work
collection remains denied by default to clients. Emulator evidence reaches all 105 same-timestamp
Enrollment rows without duplicates/missing IDs, advances the physical cursor past interleaved hot
rows, terminates `account_hot`, isolates a selected sibling, and rejects unmanaged/ended
Participant selection.

**Deferred at 9C.B/9C.C/9C.D:** 9C.E containment/smoke. Overall 9C was not PASS until 9C.E.

**9C.C READY_FOR_9C.D (2026-09-14; no deploy).** Student Home, «Мои курсы», Calendar CourseDay
presentation, and enrolled Course detail now follow the selected Participant. Account Enrollment
sync passes authorized `selectedParticipantId` instead of hydrating all managed siblings and
filtering in the client. Store generation rejects a late response for A after switching to B.
Course cards and enrolled detail render canonical `courseProgress` as «Прогресс курса»
(`elapsedDays` of `scheduledDays`); «Посещено» and «Посещаемость» stay separate, with null rate
shown as «Нет данных». `attendanceCoveragePercent` is not labeled as course progress.
`completed` is «Курс завершён»; `no_show` is a distinct terminal outcome; 100% progress while
`confirmed` is not completion. Enrolled detail identity is the exact `enrollmentId` for the
selected Participant.

**9C.D READY_FOR_9C.E (2026-09-14; no deploy, no backfill).** `course_graduate` is issued
server-side in the same Firestore transaction as the canonical CourseEnrollment
`confirmed → completed` transition. `record_course_day_attendance`, `resolve_attendance_outcome` (including the 9C.B scheduler),
and `reconcile_course_enrollment` share `planCourseGraduateAchievementIssuance` against
`/participant_achievements/{participantId}`.
`earnedAt = lifecycle.completedAt`, source `course_completion`, once-earned / idempotent, and
participant-isolated. Historical completed Enrollments are not scanned. Frontend presentation
is unchanged from 9C.A.

**9C.E PASS / CLOSED (2026-09-14; no deploy, no backfill).** Course product-path legacy
reachability is contained. Authenticated `enrollInCourse` is unexported and removed (same
guest-callable pattern): no frontend caller, no guest caller, no server/internal product
caller. Active enrollment is `create_course_enrollments`. Synthetic `booking_course_*`
records are not Course Progress / Enrollment / Completion / Achievement authority or fallback.
`activity_logs.booking_completed` remains presentation/history only. Certificates stay a
static Student placeholder, not completion authority. Counters for this feature family:
legacy WRITE = 0, authority READ = 0, fallback = 0, dual-write = 0. Leftover dead helpers
(`courseTransactions.enrollInCourse`, unused `getStudentCourseBookingsQuery`) are not
production-reachable and belong to later 9P/T32.9B physical cleanup, not 9C.

**T32.9A.9C PASS / CLOSED.** Canonical Course path is Course → CourseDay →
CourseEnrollment(participant) → Attendance → outcome → request-time `courseProgress` →
Student UI → transactional `course_graduate`. The 2026-09-14 source closure above recorded no
deploy, migration, or backfill of its own; the production deployment of this read surface is
subsequently evidenced by the Admin Lessons + Courses consolidation cutover, whose authenticated
production smoke exercised `queryAdminCourseEnrollmentReadModels` (see that section above).
9C remains **PASS / CLOSED** and is not reopened by the later production evidence. 9P then proves
Course progress/achievements together with the rest of the product, not as a substitute for 9C.

#### T32.9A.9P — Global Product Parity & Legacy Dependency Gate — PASS / CLOSED

Purpose: before any destructive legacy data or leftover-implementation cleanup, prove that **every existing useful product capability** has a working canonical or explicitly approved path.

9P is an inventory-and-evidence gate. It does not implement F3, 9B, 9C, or **T32.9A.9A.F5**. **PASS / CLOSED** (2026-09-14) for source / current production client. Leftover counters: ACTIVE_WRITE = 0, AUTHORITY_READ = 0, FALLBACK = 0, DUAL_WRITE = 0. `users.balanceUSD` signup write and `settings/starter_credit.amountUsd` historical read are **KEEP_COMPATIBILITY**, not leftover authority. Guest course expiry production deploy / deployed `createGuestCourseEnrollment` were tracked as **T32.9A.9A.F5** and did **not** reopen 9P client parity; F5 is now **PASS / CLOSED** (production expiry smoke PASS 2026-09-16), while the production Function-delete inventory gate remains separate.

Mandatory inventory (filled 2026-09-14; reconciled 2026-09-14 for 9P close; F5 gate closed 2026-09-16). Production Function inventory remains UNKNOWN as a separate delete gate:

| Feature / capability | Role(s) | Current UX | Current dependency | Canonical/approved replacement | Information parity | Action parity | Interaction parity | Status | Safe to remove legacy? |
| -------------------- | ------- | ---------- | ------------------ | ------------------------------ | ------------------ | ------------- | ------------------ | ------ | ---------------------- |
| Guest lesson | Guest, Admin | Home + planner | executeGuestCanonicalCommand + F2 | Canonical Booking/Payment | PASS | PASS | PASS | PASS | yes |
| Guest course enroll | Guest, Admin | Course modal | create_course_enrollments | Canonical CourseEnrollment | PASS | PASS | PASS | PASS | source leftover unpublished; production delete gated by inventory (not by F5) |
| Guest course expiry | Guest | scheduler | scheduledExpireGuestCourseReservations | F5 PASS / CLOSED | n/a | n/a | n/a | PASS | source export present; production deploy/smoke verified, not a 9P client gate |
| Student cabinet | Student, Guardian | Cabinet | canonical reads + selectedParticipantId | same | PASS | PASS | PASS | PASS | no synthetic course authority |
| Instructor workspace | Instructor | workspace | canonical bookings + attendance + feedback | same | PASS | PASS | PASS | PASS | yes |
| Admin planner/courses/people | Admin | Admin Panel | canonical commands | same | PASS | PASS | PASS | PASS | unused wrappers only |
| Admin finance | Admin | Canonical finance panels | queryAdminFinanceReadModels | Wallet/Payment/MonetaryEvent | PASS | PASS | PASS | PASS | unmounted CashFlow/GuestWallet |
| Lesson booking F3/F4 | Student, Instructor, Admin | modal / card / planner | canonical party + Attendance | same | PASS | PASS | PASS | PASS | guest create single-participant |
| Course progress / graduate | Student, Instructor, Admin | cabinet + roster | 9C | same | PASS | PASS | PASS | PASS | yes |
| Wallet / starter credit | Student, Admin, Auth | Header + settings | /wallet/state + amountKzt | KZT Wallet | PASS | PASS | PASS | PASS | KEEP_COMPATIBILITY users.balanceUSD / amountUsd field names |
| Attendance | Instructor, Admin, Student | lesson + course | canonical Attendance | same | PASS | PASS | PASS | PASS | yes |
| Participants / avatars | Student, Guardian, Admin | cabinet + people | Participant | same | PASS | PASS | PASS | PASS | /users mirror |
| Reviews / rating | Student, Instructor | reviews UI | 9B continuity | same | PASS | PASS | PASS | PASS | KEEP_HISTORICAL /reviews |
| Lesson feedback | Instructor, Student | instructor + coach | ParticipantLessonFeedback | same | PASS | PASS | PASS | PASS | yes |
| Progress / achievements | Student, Instructor, Admin | cabinet | 9B.2/9B.4 + 9C | same | PASS | PASS | PASS | PASS | KEEP_HISTORICAL users progress |
| Chat | Student, Instructor, Admin | BookingChatModal | bookings/{id}/messages | same storage | PASS | PASS | PASS | PASS | KEEP_HISTORICAL |
| Homework | Instructor, Student, Guardian | chat + coach tab | assign_chat_homework | 9P.HW1 | PASS | PASS | PASS | PASS | KEEP_HISTORICAL |
| Notifications | all | bell | notifications | same | PASS | PASS | PASS | PASS | KEEP_HISTORICAL |
| Auth / login | Guest, Student | Auth | Auth + profile create | same | PASS | PASS | PASS | PASS | KEEP_COMPATIBILITY |
| Settings | Admin | system settings | settings/amountKzt | same | PASS | PASS | PASS | PASS | KEEP_COMPATIBILITY |
| Assets / avatars | all | media | Storage | same | PASS | PASS | PASS | PASS | KEEP_HISTORICAL |

Status values:

```text
PASS
PARTIAL
MISSING
NEEDS_PRODUCT_DECISION
```

**9D physical cleanup** may start only from the 9D0-rehearsed exact manifest. 9P in-scope rows are **PASS**. The former **BLOCKED_BY_F5** condition is resolved (F5 PASS / CLOSED, 2026-09-16); production Function deletions remain **BLOCKED_BY_PRODUCTION_INVENTORY** and are not in the 9D executable delete set.

Minimum capabilities that must appear in the inventory (add rows; do not treat this list as optional):

- Guest (lesson reservation, course enrollment, payment/expiry, confirmation, linking)
- Student (cabinet current/history, booking, enrollment, cancellation)
- Instructor (schedule, history, attendance, workspace)
- Admin (planner, Booking detail, Courses, Finance, People/Instructors)
- Lesson Booking (including authenticated multi-participant after F3 and per-participant Instructor Attendance after F4; guest remains the accepted single-participant creation boundary)
- Course / CourseEnrollment
- Planner / Schedule
- Finance
- Wallet (including starter credit)
- Attendance
- Profile / People
- Participants
- Reviews / instructor rating (9B continuity must already be PASS or an explicit PO decision)
- Recommendations / Feedback
- Progress / Achievements (lesson 9B and course 9C)
- Chat
- Homework
- Notifications
- Auth / Registration / login
- Settings
- assets / images (avatars, instructor/course media, chat media)

##### Chat / Homework — mandatory 9P element (do not delete with legacy Booking)

Verified current runtime (2026-09-08), not assumed:

- Message storage is `bookings/{threadId}/messages/{messageId}` (`src/features/chat/chatService.ts`).
- Lesson threads use the lesson Booking id. Course/shared chat uses `chatId` / `courseId` / synthetic `course_*` instructor id as `threadId` (`src/domain/chat/resolveChatId.ts`).
- Course unread/history still subscribes to **shared + per-enrollment legacy** thread ids (`getCourseChatThreadIds`).
- Homework flags: `isHomework`, `homeworkForParticipantIds` (canonical). Clients cannot create or update homework fields; `assign_chat_homework` is the writer. Rules deny those fields on message create and `affectedKeys()` on admin update.
- Unread behavior is client subscription over those thread ids (`useBookingChatUnread`).
- Message deletes are denied by Rules (`allow delete: if false`).

Forbidden outcome:

```text
legacy Booking cleanup
  → parent/thread document removed
  → messages / homework lost
```

9P must classify every `bookings/{id}` that has a `messages` subcollection (lesson thread, course shared thread, leftover per-enrollment thread). 9D must not delete a parent until that inventory has an approved preserve-or-relocate policy. This document does **not** require a new Chat aggregate. Keeping messages under `bookings/{threadId}/messages` is allowed if 9P proves access, unread, homework targeting, and Rules still work after selective parent deletion.

Chat/Homework rows in 9P cannot be `Safe to remove legacy? = yes` while messages still physically depend on uninventoried legacy Booking documents.

##### T32.9A.9P.HW1 — Participant-scoped Chat Homework — PASS

**Not** part of **T32.9A.9B.3** / ParticipantLessonFeedback. Ordinary chat messages remain a separate preserved capability.

**Current problem (closed):** homework used account/user-scoped `homeworkForUserIds[]` on `bookings/{threadId}/messages` and could show the same homework to multiple Participants of one Account.

**Implemented:**

- `homeworkForParticipantIds[]` (participant-scoped targeting)
- assignment only when Attendance=`present` for that Participant
- participant-specific visibility (multi-participant isolation)
- dependent Participant support without requiring a `/users` document
- server-authoritative enforcement in Rules/callables
- ordinary (non-homework) chat messages unchanged

Status: **PASS**. Canonical target is `homeworkForParticipantIds[]`. Assignment is server-authoritative via `assign_chat_homework` (`create` / `set`). Only Participants with Attendance=`present` on that lesson booking may be targeted. Instructor may choose one, several, or all present Participants. Present sibling does not grant homework to an absent or untargeted sibling. Dependent Participant without `/users/{uid}` is supported. Student/Guardian `selectedParticipantId` sees only homework addressed to that Participant. Client cannot spoof Participant ids. Historical `homeworkForUserIds` is not auto-mapped; empty/unset legacy targets do not fan out. Ordinary chat remains client Firestore create without homework fields.

##### 9D cleanup manifest — 9D0 validated (2026-09-14)

Source reachability rehearsal only. Physical 9D not executed. Production Function / data deletion not authorized.

```text
DELETE_IN_9D
- unused frontend booking *Callable wrappers, useBookingActions, useAdminActions, bookingService.ts
- src/features/bookings/completeBooking.ts
- unmounted CashFlowPanel / GuestWalletPanel
- resetSchoolFinances.ts
- leftover functions/src/bookings/* (not exported from functions/src/index.ts)
- functions/src/schoolGuestWallet.ts + functions/src/schoolGuestWallet.test.ts
- functions/src/walletLedger.ts (only leftover bookings/enroll callers)
- barrel exports of the deleted symbols
- getStudentCourseBookingsQuery export
- adminService subscribeGuestWalletBalance / adjustGuestWalletBalance

KEEP
- FinancialOverview / AdminFinancialOverviewHost
- AdminInstructorDirectory canonical instructor commands
- bookingTransactions.ts InsufficientFundsError (production type import)
- courseTransactions.ts helpers used by leftover bookingTransactions (file KEEP)
- domain schoolGuestWallet.ts / schoolCashFlow.ts
- scheduledExpireGuestCourseReservations source export
- createGuestCourseEnrollment source already absent; do not treat production as deleted

DEFER_TO_T32.9B
- courseTransactions.enrollInCourse (production UI unused; integration tests still call it)
- getEnrolledCourses / getActiveCourseEnrollment / getAvailableCourses / getRecommendedCourses / resolveNextLessonBookingTarget
- bookingRealtimeService.ts file (getRealtimeBookingsQuery tests-only)
- bookingTransactions leftover mutation functions after callable deletion
- unused Rules helpers validBalanceDecreaseOnly / validPaymentLedgerCreate / validRefundBalanceCreditApply / validRefundLedgerCreate
- CoachesManager.tsx (unmounted; canonical People already mounted)
- i18n keys for resetSchoolFinances / guestWallet panels

RESOLVED_BY_F5_CLOSURE (2026-09-16)
- production smoke of expired guest CourseEnrollment reservation — **PASS** (no longer `BLOCKED_ONLY_BY_PRODUCTION_EXPIRY_SMOKE`)
- treating canonical guest course lifecycle as production-complete — **allowed** (still subject to the inventory gate below for Function deletes)

Resolved on 2026-09-14 (no longer F5 blockers):
- `createGuestCourseEnrollment` production presence — **ABSENT**
- `scheduledExpireGuestCourseReservations` deploy/running — **ACTIVE**, healthy no-op executions

BLOCKED_BY_PRODUCTION_INVENTORY
- every production Function delete (createBooking, addBooking, createGuestBooking,
  updateBookingSchedule, linkGuestBooking, completeBooking, cancelBooking, confirmBooking,
  deleteBooking, requestBookingCancellation, enrollInCourse, createGuestCourseEnrollment,
  scheduledAutoCompleteBookings, and any other leftover deployed name)
```

Exact executable identifiers live in **T32.9A.9D0** below.

#### T32.9A.9D0 — Production-like Incremental Cutover Rehearsal — PASS / CLOSED

Reason: original T37 / T38 / T40 tickets and Phase 7 describe a **clean/empty database** reset then seed. That is valid only as isolated nonproduction architectural rehearsal. Current production already holds canonical Booking, Payment, Attendance, claims, enrollments, and live product data. Production strategy is **selective/incremental**.

**9D0 PASS / CLOSED (2026-09-14)** is a source-dependency rehearsal of the exact 9D delete set. It is not T38 and it did not execute destructive `rm`, Function delete, or data delete.

```text
9P SAFE_TO_DELETE_* manifest
        ↓
actual source import / export reachability
        ↓
canonical replacement + UX parity check
        ↓
dry-run compile/import fallout
        ↓
exact DELETE_* / KEEP / DEFER / BLOCKED lists
```

Must preserve (expected-preserved set — 9D data delete = NONE):

- canonical Booking
- Payment
- Attendance
- Resource Claims
- Participants / relations
- CourseEnrollment
- canonical audit / history
- approved reviews / chat / homework / notifications / profile / assets / other 9P-approved product data

Manifest acceptance for this rehearsal:

```text
expected deleted data   == 0
unexpected deletion     == 0
source leftover WRITE / authority READ / fallback / dual-write == 0
production Function deletions explicitly gated
```

A successful T38 empty-database rehearsal does **not** substitute for this 9D0. **T32.9A.9A.F5** was not **PASS / CLOSED** when 9D0 was rehearsed (2026-09-14), so at that date 9D0 correctly did not treat source removal as proof that the deployed `createGuestCourseEnrollment` function was decommissioned or that canonical guest course automatic expiry was production-complete. F5 has since closed (production expiry smoke PASS 2026-09-16), and the deployed name was independently confirmed **ABSENT**; the remaining production Function-delete gate is the inventory, not F5.

##### 9D0 exact delete manifest (executable)

###### DELETE_FILES

Prerequisite for all rows: strip barrel re-exports; rewrite or delete tests that import the removed file. Canonical replacement is listed. Delete now in 9D: YES.

| Path | Why safe | Inbound production imports | Tests-only imports | Replacement |
| ---- | -------- | -------------------------- | ------------------ | ----------- |
| `src/features/bookings/createBookingCallable.ts` | unpublished callable wrapper | `bookingService.ts` only | `tests/unit/bookingCallables.test.ts` | `executeCanonicalCommand` / `create_lesson_booking` |
| `src/features/bookings/addBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | `executeCanonicalCommand` / admin lesson create |
| `src/features/bookings/createGuestBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | `executeGuestCanonicalCommand` / `create_guest_lesson_booking` |
| `src/features/bookings/updateBookingScheduleCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | `reschedule` canonical command |
| `src/features/bookings/linkGuestBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | `link_guest_booking` canonical command |
| `src/features/bookings/completeBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | attendance / complete canonical path |
| `src/features/bookings/cancelBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | `cancel_lesson_booking` |
| `src/features/bookings/confirmBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | guest payment confirmation / `confirm_guest_booking` |
| `src/features/bookings/deleteBookingCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | canonical cancel / admin command |
| `src/features/bookings/requestBookingCancellationCallable.ts` | same | `bookingService.ts` only | `bookingCallables.test.ts` | canonical cancellation request |
| `src/features/bookings/useBookingActions.ts` | no production hook caller | barrel export only | `useBookings.cancel.test.tsx`, wiring tests | `useLessonBookingCommands` |
| `src/features/bookings/bookingService.ts` | after hook deletion, no production importer | `useBookingActions`, `useAdminActions`, barrel `getInstructorAvailabilitySlots` (zero callers) | file-content wiring tests | canonical commands + occupancy read models |
| `src/features/bookings/completeBooking.ts` | `finalizeBookingCompletion` unused in `src/` | none | none | canonical attendance outcome |
| `src/features/admin/useAdminActions.ts` | no production hook caller; People uses canonical instructor commands | barrel export only | file-content wiring tests | `create_instructor_catalog_entry` / `update_instructor_catalog_profile` / `deactivate_instructor_catalog` |
| `src/features/admin/resetSchoolFinances.ts` | no production caller | none | negative wiring assertions | none required; destructive reset is not a product path |
| `src/features/admin/components/finance/CashFlowPanel.tsx` | unmounted | barrel export only | `adminFinanceContracts` negative | `AdminFinancialOverviewHost` / `queryAdminFinanceReadModels` |
| `src/features/admin/components/finance/GuestWalletPanel.tsx` | unmounted | barrel export only | `adminSafetyReadOnlyPanels.test.tsx` | `CanonicalGuestFinancePanel` |
| `functions/src/bookings/addBooking.ts` | not exported from `functions/src/index.ts` | leftover bookings cluster only | `bookingCallables.test.ts` | canonical command handlers |
| `functions/src/bookings/createBooking.ts` | same | cluster only | `bookingCallables.test.ts` | `create_lesson_booking` |
| `functions/src/bookings/createGuestBooking.ts` | same | cluster only | `bookingCallables.test.ts` | guest lesson command |
| `functions/src/bookings/updateBookingSchedule.ts` | same | cluster only | `bookingCallables.test.ts` | reschedule command |
| `functions/src/bookings/linkGuestBooking.ts` | same | cluster only | `linkGuestBooking.test.ts` | link command |
| `functions/src/bookings/completeBooking.ts` | same | cluster only | `bookingCallables.test.ts` | attendance outcome |
| `functions/src/bookings/cancelBooking.ts` | same | cluster only | `bookingCallables.test.ts` | cancel command |
| `functions/src/bookings/confirmBooking.ts` | same | cluster only | `bookingCallables.test.ts` | confirm command |
| `functions/src/bookings/deleteBooking.ts` | same | cluster only | `bookingCallables.test.ts` | cancel / admin command |
| `functions/src/bookings/requestBookingCancellation.ts` | same | cluster only | `bookingCallables.test.ts` | cancellation request command |
| `functions/src/bookings/autoComplete.ts` | index already forbids this import | none from index | cutover negative assertion | `scheduledResolveLessonBookingAttendanceOutcomes` |
| `functions/src/bookings/bookingLogic.ts` | only leftover callables | leftover bookings + `mapBookingHttpsError` | cluster tests | canonical booking commands |
| `functions/src/bookings/mapBookingHttpsError.ts` | only leftover callables | cluster only | `mapBookingHttpsError.test.ts` | canonical error mapping |
| `functions/src/bookings/bookingCallables.test.ts` | tests-only companion | n/a | self | cutover no-export assertions |
| `functions/src/bookings/linkGuestBooking.test.ts` | tests-only companion | n/a | self | canonical link tests |
| `functions/src/bookings/mapBookingHttpsError.test.ts` | tests-only companion | n/a | self | canonical error tests |
| `functions/src/schoolGuestWallet.ts` | only leftover bookings | `bookingLogic.ts`, `cancelBooking.ts` | `functions/src/schoolGuestWallet.test.ts` | canonical Payment / Wallet |
| `functions/src/schoolGuestWallet.test.ts` | companion | n/a | self | canonical finance tests |
| `functions/src/walletLedger.ts` | only leftover bookings + already-removed enroll callable | `schoolGuestWallet.ts`, leftover bookings, historically `enrollInCourse.ts` | none remaining | canonical MonetaryEvent / Wallet |

Already absent (do not re-delete; not a 9D file action):

- `functions/src/courses/enrollInCourse.ts` — source file absent; export absent from `functions/src/index.ts`
- `src/features/courses/enrollInCourseCallable.ts` — source file absent
- `functions/src/courses/createGuestCourseEnrollment.ts` — source file absent
- `src/features/courses/createGuestCourseEnrollmentCallable.ts` — source file absent

###### DELETE_EXPORTS

| Identifier | File | Prerequisite | Replacement |
| ---------- | ---- | ------------ | ----------- |
| `useBookingActions` | `src/features/bookings/index.ts` | delete `useBookingActions.ts` | `useLessonBookingCommands` |
| `getInstructorAvailabilitySlots` | `src/features/bookings/index.ts` | delete `bookingService.ts` | occupancy / proposal read models |
| `useAdminActions` | `src/features/admin/index.ts` | delete `useAdminActions.ts` | Admin People canonical commands |
| `CashFlowPanel` | `src/features/admin/index.ts` and `src/features/admin/components/finance/index.ts` | delete panel file | `FinancialOverview` |
| `GuestWalletPanel` | `src/features/admin/components/finance/index.ts` | delete panel file | `CanonicalGuestFinancePanel` |
| `getStudentCourseBookingsQuery` | `src/features/bookings/bookingRealtimeService.ts` | none; production sync already off this query | `queryCourseEnrollmentReadModels` |
| `subscribeGuestWalletBalance` | `src/features/admin/adminService.ts` | delete CashFlow / GuestWallet panels | canonical guest finance read model |
| `adjustGuestWalletBalance` | `src/features/admin/adminService.ts` | no production caller | none; leftover mutation |

###### DELETE_FUNCTIONS_PRODUCTION

NONE.

Classification of leftover names (do not delete in 9D):

| Name | Source export | Production |
| ---- | ------------- | ---------- |
| `createBooking` | A. absent | B. unknown |
| `addBooking` | A. absent | B. unknown |
| `createGuestBooking` | A. absent | B. unknown |
| `updateBookingSchedule` | A. absent | B. unknown |
| `linkGuestBooking` | A. absent | B. unknown |
| `completeBooking` | A. absent | B. unknown |
| `cancelBooking` | A. absent | B. unknown |
| `confirmBooking` | A. absent | B. unknown |
| `deleteBooking` | A. absent | B. unknown |
| `requestBookingCancellation` | A. absent | B. unknown |
| `enrollInCourse` | A. absent | B. unknown |
| `createGuestCourseEnrollment` | A. absent | A. **ABSENT** (independent `functions:list` 2026-09-14; not an F5 blocker) |
| `scheduledAutoCompleteBookings` | A. absent | B. unknown |
| `scheduledExpireGuestCourseReservations` | C. source export present | C. **ACTIVE** (deployed + scheduler every 5 minutes UTC; F5 PASS / CLOSED — production expiry smoke PASS 2026-09-16) |

9E later independently re-listed production (2026-09-17): every leftover name in the table above is **ABSENT**; canonical exports including `scheduledExpireGuestCourseReservations` remain **ACTIVE**. See **T32.9A.9E**.

###### DELETE_RULES

NONE. Unused leftover helpers `validBalanceDecreaseOnly`, `validPaymentLedgerCreate`, `validRefundBalanceCreditApply`, `validRefundLedgerCreate` are **DEFER_TO_T32.9B**. `settings/guest_wallet` read-only path and `/wallet_ledger` read-only path stay. Storage chat write `chat/{bookingId}` stays because chat is KEEP_HISTORICAL.

###### DELETE_INDEXES

NONE. CourseEnrollment F5 index and other live indexes remain required. `getStudentCourseBookingsQuery` is unused, but no exclusive obsolete required index was proven.

###### DELETE_FIELDS

NONE.

| Field | Class |
| ----- | ----- |
| `users.balanceUSD` | KEEP_COMPATIBILITY |
| `walletBalances.USD` | KEEP_COMPATIBILITY |
| `settings/starter_credit.amountUsd` | KEEP_COMPATIBILITY |
| `homeworkForUserIds` | KEEP_HISTORICAL |
| old `/users` progress fields | KEEP_HISTORICAL |
| old Booking recommendation fields | KEEP_HISTORICAL |
| starter-credit legacy aliases | KEEP_COMPATIBILITY |

###### DELETE_COLLECTION_DATA

NONE.

| Data | Class |
| ---- | ----- |
| synthetic `booking_course_*` | KEEP_HISTORICAL (may parent `messages`) |
| `/reviews` | KEEP_HISTORICAL |
| `wallet_ledger` | KEEP_HISTORICAL |
| `settings/guest_wallet` | KEEP_HISTORICAL |
| activity logs | KEEP_HISTORICAL |
| `bookings/{id}/messages` | KEEP_HISTORICAL |
| 11 historical disposable legacy lesson rows | DO_NOT_TOUCH until messages-child inventory |

##### Capability parity (DELETE_IN_9D only)

| Legacy capability | Legacy implementation | Canonical replacement | Parity | Deletion safe |
| ----------------- | --------------------- | --------------------- | ------ | ------------- |
| Authenticated lesson booking | `createBooking` callable / `createBookingViaCallable` | `executeCanonicalCommand` / `create_lesson_booking` | PASS | YES |
| Guest lesson booking | `createGuestBooking` callable | `executeGuestCanonicalCommand` / guest lesson create | PASS | YES |
| Lesson cancel / reschedule / link / complete | leftover `*Booking` callables + `useBookingActions` | canonical lesson commands + attendance outcome | PASS | YES |
| Authenticated course enrollment (client) | `enrollInCourse` callable files already absent | `create_course_enrollments` | PASS | source already gone |
| Guest course enrollment (client) | `createGuestCourseEnrollment` source already absent | `create_course_enrollments` via `executeGuestCanonicalCommand` | PASS | source already gone; production name NO |
| Admin finance overview | `CashFlowPanel` | `queryAdminFinanceReadModels` / `FinancialOverview` | PASS | YES |
| Admin guest funds | `GuestWalletPanel` | `CanonicalGuestFinancePanel` | PASS | YES |
| Admin instructor catalog | `useAdminActions` / `*InstructorService` | `create_instructor_catalog_entry` / `update_instructor_catalog_profile` / `deactivate_instructor_catalog` | PASS | YES |
| School finance reset | `resetSchoolFinances` | none; not a preserved product path | PASS | YES |
| Student course authority | `getStudentCourseBookingsQuery` / `getEnrolledCourses` | `queryCourseEnrollmentReadModels` / `getEnrolledCourseIdsForParticipant` | PASS | query export YES; `getEnrolledCourses` DEFER |

##### Dependency rehearsal (dry-run; no `rm`)

If the DELETE_FILES / DELETE_EXPORTS set is physically removed:

1. Frontend compile fails until barrels drop `useBookingActions`, `getInstructorAvailabilitySlots`, `useAdminActions`, `CashFlowPanel`, `GuestWalletPanel`.
2. `bookingService.ts` cannot remain if `*Callable.ts` files are deleted; delete it in the same slice.
3. `functions` compile stays green: `functions/src/index.ts` already has no leftover bookings imports.
4. Tests that import or `readRepoFile` the deleted paths fail and must be rewritten in 9D: `useBookings.cancel.test.tsx`, `bookingCallables.test.ts`, `adminSafetyReadOnlyPanels.test.tsx`, `adminSafetyContainmentWiring.test.ts`, `adminPlannerBookingWiring.test.ts`, `adminCancelWiring.test.ts`, `adminReassignWiring.test.ts`, `adminLessonBookingCanonicalBoundary.test.ts`, leftover assertions in `lessonBookingLifecycleCutoverBoundary.test.ts` that read `useBookingActions.ts` / `bookingService.ts`, plus `functions/src/bookings/*.test.ts` and `functions/src/schoolGuestWallet.test.ts`.
5. Production client runtime does not import these files today, so deleting them does not remove a mounted UX path.
6. `ScheduleSlotActionModal` keeps compiling because it imports `InsufficientFundsError` from `bookingTransactions.ts`, which is KEEP.
7. Production Cloud Functions are unchanged by source-file deletion until an authorized Functions deploy; leftover deployed names are **not** proven absent.

##### 9D validation plan (run after physical 9D, not in 9D0)

- `npx tsc --noEmit`
- `npm run build`
- `npm --prefix functions run build`
- focused canonical lesson booking tests
- guest booking tests
- course enrollment tests (`tests/unit/authenticatedCourseEnrollmentCanonicalCutover.test.ts` plus canonical command/emulator suite)
- guest course enrollment tests (`tests/unit/guestCourseEnrollmentCanonicalCutover.test.ts` plus canonical guest course suite)
- wallet / payment / starter-credit tests
- homework tests (`assign_chat_homework`)
- participant identity tests
- Rules tests (`tests/firestore.rules.test.ts`, `tests/unit/firestoreRulesGuard.test.ts`)
- reachability regression (`tests/unit/lessonBookingLifecycleCutoverBoundary.test.ts` rewritten off deleted files)
- no-import / no-export leftover assertions for deleted paths and unpublished Function names
- do not run the full suite unless those focused checks show cross-domain fallout

##### Production inventory plan (read-only; required before any production Function delete)

Project: `ski-school-8f3ca`. Do not deploy or delete.

```text
firebase functions:list --project ski-school-8f3ca
gcloud functions list --project=ski-school-8f3ca --regions=us-central1
gcloud scheduler jobs list --project=ski-school-8f3ca
firebase functions:log --only scheduledExpireGuestCourseReservations --project ski-school-8f3ca
firebase functions:log --only createGuestCourseEnrollment --project ski-school-8f3ca
```

Confirm each leftover name: confirmed deployed / confirmed absent. Until that list exists, every production Function delete stays **BLOCKED_BY_PRODUCTION_INVENTORY**. `createGuestCourseEnrollment` was additionally **BLOCKED_BY_F5**; that F5 condition is resolved (F5 PASS / CLOSED, 2026-09-16), so only the inventory gate remains.

##### F5 closure record (9D0 did not close F5 — the production expiry smoke did)

1. Deploy canonical guest course path if the current production Functions bundle is behind this source. **DONE.**
2. Deploy / verify `scheduledExpireGuestCourseReservations`. **DONE** — ACTIVE (inventory 2026-09-14).
3. Verify the production scheduler actually runs. **DONE** — Cloud Scheduler ENABLED, every 5 minutes UTC, healthy executions observed.
4. Verify expired pending not-fully-funded guest CourseEnrollment becomes `cancelled` with claims/seats released. **DONE** — production expiry smoke PASS 2026-09-16.
5. Verify canonical guest enrollment still works after deploy. **DONE** — ordinary guest creation path exercised during the smoke.
6. Inventory leftover `createGuestCourseEnrollment`; delete production Function only after no client/API caller depends on it. **DONE** — production name **ABSENT** (2026-09-14); source already removed.
7. Then, and only then, F5 may move to PASS / CLOSED. **DONE — F5 is PASS / CLOSED (2026-09-16).**

9D0 inventory check in this task: production inventory **UNKNOWN** (CLI/auth not used) at 9D0 rehearsal time; the later independent 2026-09-14 `functions:list` resolved the F5-relevant names.

#### T32.9A.9D — Selective Destructive Legacy Data Cleanup — PASS / CLOSED

**9D PASS / CLOSED (2026-09-16)** executed only the 9D0-rehearsed physical SOURCE cleanup (`DELETE_FILES` / `DELETE_EXPORTS`). Recorded:

- leftover source reachability counters ACTIVE_WRITE / AUTHORITY_READ / FALLBACK / DUAL_WRITE = 0 (`tests/unit/t32_9a_9d_legacySourceReachability.test.ts`);
- historical Firestore data untouched (`DELETE_COLLECTION_DATA = NONE`);
- production Function delete / deploy not executed (`DELETE_FUNCTIONS_PRODUCTION = NONE`);
- Rules / indexes / Storage not cleaned (`DELETE_RULES = NONE`, `DELETE_INDEXES = NONE`);
- T32.9B deferred physical/data/compat cleanup remains.

9D means **selective leftover-legacy cleanup**. It does **not** mean:

```text
full Firestore reset
delete bookings collection
production clean-start
empty-database seed as the production procedure
```

Dependencies:

```text
9A PASS
9B PASS
9C PASS
9P PASS
9D0 PASS
        ↓
9D
```

Critical product decision (unchanged): historical **legacy** lesson/booking records are not required to be preserved or backfilled. That permission applies only to rows classified disposable by the proven discriminator **and** listed in the 9D0-rehearsed delete set.

Production inventory already proved (Individual Booking cutover):

- legacy-only current/future = 0
- ambiguous = 0
- legacy past disposable = 11

Those 11 rows remain **DO_NOT_TOUCH** (messages-child inventory missing) and are not part of this 9D source slice. Canonical transactional/runtime records were not deleted. **9D executed source-file cleanup from the 9D0 DELETE_FILES / DELETE_EXPORTS lists. DELETE_COLLECTION_DATA = NONE. DELETE_FUNCTIONS_PRODUCTION = NONE.**

9D rules:

- deletion only by proven discriminator + rehearsed preserve/delete manifest;
- never “delete bookings collection”;
- preserve canonical Booking, Payment, Attendance, Resource Claims, Participants/relations, CourseEnrollment, canonical audit/history;
- preserve 9P-approved reviews, chat/homework, notifications, profile, and assets;
- `bookings/{id}/messages` requires an approved 9P policy before the parent or subcollection is deleted;
- unexpected deletion, unexpected mutation, or leftover ambiguous records = FAIL (same equalities as 9D0);
- do not migrate old historical legacy lessons into canonical Booking as a 9D action.

If 9D is held for a production maintenance window, that window is T40 and must execute this same rehearsed manifest. Do not run two independent deletion passes.

**T32.9A.9A.F5** is **PASS / CLOSED** (production expiry smoke PASS 2026-09-16), so 9D may now treat the release-candidate scheduler and the absent deployed legacy function as production-verified; the remaining production Function-delete gate is the inventory.

#### T32.9A.9E — Canonical Authority / Reachability Gate — PASS / CLOSED

**9E PASS / CLOSED (2026-09-17).** Final integration gate after 9D. Product source was not changed. Independent review **APPROVE**.

Leftover source counters (reconfirmed by `tests/unit/t32_9a_9d_legacySourceReachability.test.ts`): ACTIVE_WRITE = 0, AUTHORITY_READ = 0, FALLBACK = 0, DUAL_WRITE = 0.

Canonical capability matrix: Lesson / Course / Participant / Student / Instructor / Admin / Money = **CANONICAL_OK**. Intentional compatibility field names remain KEEP_COMPATIBILITY, not leftover authority. Participant isolation = **PASS**. Canonical spendable authority = KZT `/users/{accountId}/wallet/state`; financial truth = Payment + MonetaryEvent + canonical Wallet.

Production Functions inventory (`firebase functions:list --project ski-school-8f3ca`, 2026-09-17): deployed names match current `functions/src/index.ts`. Leftover lesson/course lifecycle names are **ABSENT** (`createBooking`, `addBooking`, `createGuestBooking`, `updateBookingSchedule`, `linkGuestBooking`, `completeBooking`, `cancelBooking`, `confirmBooking`, `deleteBooking`, `requestBookingCancellation`, `enrollInCourse`, `createGuestCourseEnrollment`, `scheduledAutoCompleteBookings`). Canonical schedulers/triggers are **ACTIVE**; healthy no-op executions observed 2026-09-17.

Graphify: no production-reachable nodes for deleted leftover families (`useBookingActions`, `CashFlowPanel`, `GuestWalletPanel`, `scheduledAutoCompleteBookings`). Production UI booking create goes `useBookingModal → useLessonBookingCommands`. Remaining `courseTransactions.enrollInCourse` / `bookingTransactions` mutations stay **DEFER_TO_T32.9B** (tests-only / unwired).

Previously failing `cabinetCancellationOutcome` case `updates course store after pending cancellation refresh` = **RESOLVED / STALE_TEST_CONTRACT**: production already requires a rendered participant-scoped enrollment; the test now seeds that contract.

AUTHENTICATED WORKFLOW: **NOT VERIFIED** in 9E (no authenticated session). Guest/public expiry evidence reused from F5 (2026-09-16); guest Functions/schedulers unchanged after that smoke.

9E is post-9D proof that authority and product journeys still hold. **T32.9A.9A.F5** remains **PASS / CLOSED**; `createGuestCourseEnrollment` is source-absent and production-ABSENT.

##### Technical reachability

- no active legacy writer
- no active legacy callable
- no legacy scheduler
- no forbidden client direct authority
- no runtime fallback
- no dual-read/write authority
- legacy scans clean, or every retained match is classified (test fixture / historical docs / explicit allowlist)
- authorization / OCC
- production deployment consistency with the 9D0/T40 manifest

##### Product reachability

After 9D, representative journeys still work for:

- Guest
- Student
- Instructor
- Admin

Those journeys must cover the 9P rows that those roles own (lesson, course, planner, finance, wallet, attendance, profile/people, reviews, chat/homework, notifications, auth, assets) rather than a reduced “happy path only” subset. T41 later expands the production-safe checklist; 9E must not be weaker than the 9P capabilities already marked PASS.

#### T32.9B — Final Legacy Write / Runtime Cleanup — PASS / CLOSED

```text
T32.9B PASS / CLOSED (2026-09-18).
```

T32.9B is physical leftover-source cleanup after authority cutover. It is not authority migration and not a product-feature deletion phase. Independent review **APPROVE_WITH_FINDINGS** (non-blocking). Leftover source counters remain ACTIVE_WRITE / AUTHORITY_READ / FALLBACK / DUAL_WRITE = 0.

Deleted (approved 9E leftover source):

- `courseTransactions.ts` including `enrollInCourse` (TEST_ONLY leftover client mutation; canonical replacement `create_course_enrollments`)
- leftover `bookingTransactions` mutations (`createBookingWithPayment`, `addBookingWithPayment`, `createGuestBooking`, `rescheduleBooking`, `cancelBookingWithRefund`); **kept** `InsufficientFundsError` for Planner `ScheduleSlotActionModal`
- unused `adminService.subscribeWalletLedger` (cabinet history still reads `wallet_ledger` via `useWalletSync`)
- unmounted `CoachesManager.tsx` (canonical `AdminInstructorDirectory` remains mounted: create / update / deactivate / photo)
- unreferenced Rules helpers `validRefundBalanceCreditApply` / `validRefundLedgerCreate` only; `validBalanceDecreaseOnly` and `validPaymentLedgerCreate` **kept** because they are still referenced by allow paths
- unused i18n keys `resetSchoolFinances*` and `guestWalletPanel*`
- unused cabinet helpers `getEnrolledCourses` / `getAvailableCourses` / `getActiveCourseEnrollment` / `getRecommendedCourses` / `resolveNextLessonBookingTarget`; **kept** `getMyInstructors` / `getRecommendedInstructors` / `getInstructorPickerGroups`
- leftover tests that only exercised the deleted mutations

Deferred (not source authority; later optional cleanup):

- `bookingRealtimeService.ts` (TEST_ONLY query helper)
- domain `walletCredit.ts` / `schoolGuestWallet.ts` / `recordWalletLedgerEntryInTransaction` (no remaining feature caller)
- `clearStudentBookings.ts` and leftover `clearStudentBookings*` i18n
- leftover `profileService` progress writers (`updateStudentSkillsService` / `updateStudentLevelService`)
- Rules tightening of still-referenced `validBalanceDecreaseOnly` / `validPaymentLedgerCreate` allow paths
- availability_slots / availability_hour_locks runtime helpers still used by remaining booking presentation
- USD-named compatibility fields (KEEP_COMPATIBILITY; see T39)
- `bookingsBlockingInstructorDeactivation` helper after CoachesManager deletion

T39 historical data is **not** part of this 9B close.

#### T39 — Historical Data Cleanup — PASS / CLOSED

Read-only production inventory 2026-09-18 on `ski-school-8f3ca` (ACTIVE, `782358732601`). Data was **not** deleted. Independent destructive review **APPROVE_WITH_FINDINGS** (non-blocking). Auth used gcloud user refresh via curl (Firebase CLI login remains expired; ADC Python SSL is broken; REST counts succeeded).

```text
DELETE_COLLECTIONS = NONE
DELETE_DOCUMENT_QUERIES = NONE
DELETE_FIELDS = NONE
DELETE_DOCUMENT_IDS =
  reviews/rev_dlc2wig
  reviews/rev_kcysdj3
  reviews/rev_zux6z99
  settings/guest_wallet
EXPORT_FIRST = the four exact documents as JSON (do not export all of settings)
BACKUP_FIRST = same
KEEP_HISTORICAL = bookings/{id}/messages (25; parents booking_1af0284510fe4dd38d288ae01ed3c602, booking_6f814ea3d0d54c26a5d8e3b2ce80f462, course_1784218471756, course_carving_pro), activity_logs (443)
KEEP_FINANCIAL_AUDIT = wallet_ledger (17), payments (69), monetary_events (77), users/{id}/wallet/state
KEEP_COMPATIBILITY = users.balanceUSD, walletBalances.USD, settings/starter_credit.amountUsd, UserProfile level/skillScores/skillComments, homeworkForUserIds
```

Production counts (aggregation / exact GET):

| Resource | Count | Classification |
| --- | --- | --- |
| `/reviews` | 3; subcollections 0 | SAFE_AFTER_EXPORT |
| `/instructor_reviews` | 2 (hashed IDs, no `rev_*` overlap) | KEEP (canonical) |
| `settings/guest_wallet` | exists; `balanceUSD=100`; update 2026-08-20; children 0 | SAFE_AFTER_BACKUP |
| `booking_course_*` parents | 0 | no delete target |
| `instructorId` `course_*` bookings | 0 | no delete target |
| collection-group `messages` under `booking_course_*` | 0 | no delete target |
| `wallet_ledger` | 17 | KEEP_FINANCIAL_AUDIT |
| `activity_logs` | 443 | KEEP_HISTORICAL |
| `bookings/{id}/messages` | 25 | KEEP_HISTORICAL |
| `bookings` | 72 | KEEP |
| `course_enrollments` | 8 | KEEP |
| `payments` | 69 | KEEP_FINANCIAL_AUDIT |
| `monetary_events` | 77 | KEEP_FINANCIAL_AUDIT |
| `settings/starter_credit` | exists; **only** `amountUsd=50` | KEEP_COMPATIBILITY |

Classification (one primary each):

- `/reviews` — SAFE_AFTER_EXPORT. Writer/reader/fallback = 0. Rules deny all. Canonical UI is `/instructor_reviews`. Historical `rev_*` docs are not copied into canonical hashed IDs.
- `settings/guest_wallet` — SAFE_AFTER_BACKUP. No production feature reader/writer. Rules deny mutation (`settingId != 'guest_wallet'`). Not a financial journal.
- `booking_course_*` — SAFE_TO_DELETE vacuously (count 0 parents and 0 child messages). **Not listed in DELETE_DOCUMENT_IDS.**
- `wallet_ledger` — KEEP_FINANCIAL_AUDIT. Cabinet history still listens (`useWalletSync`).
- `bookings/{id}/messages` — KEEP_HISTORICAL. Live chat/homework, including `bookings/{courseId}/messages`.
- `activity_logs` — KEEP_HISTORICAL. Cabinet history still listens (`useProfileActivitySync`); canonical commands write.

Compatibility fields: `amountUsd` remains dual-write / Rules fallback and is the **only** field on production `starter_credit`. Not a T39 deletion candidate.

**Executed 2026-09-18 after explicit user approval of this exact 4-document list.** Local JSON backup in `t39-backup/` (not committed; review payloads contain PII). Deleted: `reviews/rev_dlc2wig`, `reviews/rev_kcysdj3`, `reviews/rev_zux6z99`, `settings/guest_wallet`. Post-delete: `/reviews` = 0; those four GET = 404; `/instructor_reviews` = 2; `wallet_ledger` = 17; messages = 25; `payments` = 69; `monetary_events` = 77. Restore material is the four REST documents. T39 is **PASS / CLOSED**. Next accepted slice is **T40**.

## Executive conclusion

The production `/admin` runtime is not connected to canonical read models and
does not invoke canonical commands. It remains a legacy administration surface
over raw `bookings`, `users`, `instructors`, `courses`, `wallet_ledger`,
`settings`, and related collections.

The canonical backend already covers substantial parts of lesson bookings,
CourseEnrollments, finance, Participant access, Course provisioning,
CourseDays, attendance, and AdminIssues. The principal migration blockers are:

1. no administrator read-model scopes;
2. missing administrator command wiring in the frontend;
3. callable routing gaps for some existing command handlers;
4. missing canonical commands for several Course and CourseDay amendments;
5. no production handler for `complete_booking`;
6. direct client money writes and destructive reset operations;
7. broad legacy Firestore permissions required by the current UI.

The first implementation slice should be **T32.1 — Safety containment**:

- prevent deletion or replacement of strict canonical Courses through the
  legacy Admin UI;
- disable or isolate direct balance and guest-wallet mutation;
- disable or isolate finance reset and bulk booking reset operations;
- add Firestore Rules and emulator regression coverage for these boundaries.

This removes immediate corruption paths before larger read-model and workflow
migrations begin.

## Scope and constraints

This audit covers the active Admin runtime and its dependencies. It does not:

- modify application code or production data;
- deploy;
- migrate hidden legacy courses;
- start T33 history work (T33 remains bound by the [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md) UX preservation contract);
- weaken `CourseSchema.strict()`;
- remove T31B.1 contamination guards;
- restore `instructorIds` as canonical authority;
- create a commit.

The audit used the current Graphify graph, targeted source inspection,
Firestore Rules, callable registration and authorization code, and the
available test suites.

## 1. Admin runtime architecture

### 1.1 Route and shell

The active route is:

```text
/admin
  -> AdminRoute
  -> AdminRouteContainer
  -> AdminPanel
```

The route is gated in the frontend by `userProfile.role === "admin"`.
`AdminRouteContainer` assembles data and actions from the legacy stores and
passes them into `AdminPanel`.

Relevant entry points:

- `src/app/routes/AdminRouteContainer.tsx`
- `src/features/shell/RouteGate.tsx`
- `src/features/admin/components/AdminPanel.tsx`
- `src/features/admin/adminNavigation.ts`
- `src/features/admin/useAdminActions.ts`

### 1.2 Active tabs

| Tab           | Active screens                                         | Current authority                                              |
| ------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Shared header | `FinancialOverview`                                    | Legacy `bookings` and `school_global_stats`                    |
| Operations    | `ScheduleCalendar`, `BookingsLog`                      | Legacy `Booking[]` and booking callables                       |
| Finance       | `GuestWalletPanel`, `CashFlowPanel`                    | `settings/guest_wallet`, `wallet_ledger`                       |
| People        | `ClientsManager`, `CoachesManager`, `AdminRoleManager` | `users`, `instructors`                                         |
| Product       | `CoursesManager`, resort content/settings              | Legacy Course shape, `resort_data`                             |
| System        | Settings, destructive reset tools, error logs          | `settings`, `bookings`, `wallet_ledger`, `users`, `error_logs` |

### 1.3 Data-plane split

The active Admin path is:

```text
Admin UI
  -> legacy Zustand stores
  -> legacy services or legacy callable wrappers
  -> raw Firestore collections
```

The canonical path is:

```text
Feature command hook
  -> executeCanonicalCommand
  -> server-side capability resolution
  -> canonical command handler
  -> canonical aggregate/event/read-model state
```

These paths are disconnected for `/admin`.

`src/store/useDataSyncScope.ts` enables canonical lesson booking and
CourseEnrollment reads for the cabinet, not for Admin. No active Admin
component calls the canonical read-model client or
`executeCanonicalCommand`.

Canonical lesson bookings can also be invisible to Admin because the legacy
Admin mapper expects the old booking document shape.

### 1.4 Strong coupling identified by Graphify

- `AdminPanel` is the central UI hub for all Admin features.
- `AdminRouteContainer` combines broad stores and workflow handlers into one
  prop surface.
- `src/features/bookings/bookingService.ts` is a legacy service hub shared by
  Admin, cabinet, and instructor workflows.
- Course administration is split between `CoursesManager`, form hooks,
  `courseService`, the course store, and presentation-content joins.
- Finance behavior is distributed across Admin panels, wallet helpers, legacy
  booking callables, and settings documents.

Clear unused or duplicate paths found during the audit include
`adminSelectors`, `useAvailabilityMigrationSync`, the deprecated
`SystemSettings` wrapper, and an unused `ResortConfigForm` wrapper. They should
not be removed as part of the first migration slices.

## 2. Mutation inventory

Classification:

- **Canonical** — mutation passes through the canonical command runtime.
- **Legacy direct** — browser writes directly to Firestore.
- **Hybrid legacy** — UI invokes a callable, but the callable implements legacy
  Firestore business logic rather than a canonical command.
- **Read-only** — no mutation.
- **Unused/dead** — no evidence of an active runtime path.

### 2.1 Lesson booking and schedule mutations

| Capability                       | UI to writer                                                                     | Destination/effect                                         | Class                            | Risk     |
| -------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- | -------- |
| Create lesson, break, or day-off | `ScheduleSlotActionModal` -> `useAdminActions` -> `addBooking` callable          | `bookings`, balances, availability and ledger state        | Hybrid legacy                    | HIGH     |
| Confirm pending lesson           | `BookingsLog` -> `confirmBookingService` -> `confirmBooking` callable            | Legacy booking lifecycle and availability                  | Hybrid legacy                    | HIGH     |
| Complete lesson                  | `BookingsLog`/Schedule -> `completeBookingService` -> `completeBooking` callable | Legacy bookings, activity and availability                 | Hybrid legacy                    | HIGH     |
| Cancel/refund lesson             | `BookingsLog`/Schedule -> `cancelBookingService` -> `cancelBooking` callable     | Booking state, user/guest balance, ledger and availability | Hybrid legacy                    | CRITICAL |
| Approve cancellation request     | `BookingsLog` -> `cancelBooking`                                                 | Legacy cancellation and refund logic                       | Semantic mismatch; hybrid legacy | CRITICAL |
| Reject cancellation request      | `BookingsLog` -> `confirmBooking`                                                | Restores legacy confirmed status                           | Semantic mismatch; hybrid legacy | CRITICAL |
| Reschedule lesson                | `ScheduleSlotActionModal` -> `updateBookingSchedule` callable                    | Booking schedule and availability locks                    | Hybrid legacy                    | HIGH     |
| Reassign lesson instructor       | Same schedule callable                                                           | Booking, pricing/balance and availability                  | Hybrid legacy                    | CRITICAL |
| Link guest lesson to account     | `LinkGuestBookingModal` -> `linkGuestBooking` callable                           | Rewrites booking ownership and related legacy data         | Hybrid legacy                    | HIGH     |
| Delete booking or block          | Schedule -> `deleteBooking` callable                                             | Booking, availability, course/stats side effects           | Hybrid legacy/destructive        | HIGH     |

### 2.2 Course mutations

| Capability               | UI to writer                                               | Destination/effect                                  | Class                                   | Risk     |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | -------- |
| Create or clone course   | `CoursesManager`/`useCourseForm` -> `courseService.setDoc` | Flat legacy `/courses/{id}` document                | Legacy direct                           | HIGH     |
| Edit course              | `CoursesManager` -> `courseService.updateDoc`              | Legacy operational and presentation fields          | Legacy direct; canonical update guarded | HIGH     |
| Hide/show or reorder     | `CoursesManager` -> `courseService.updateDoc`              | Legacy course fields                                | Legacy direct; canonical update guarded | HIGH     |
| Delete course            | `CoursesManager` -> `courseService.deleteDoc`              | Deletes `/courses/{id}` without a canonical cascade | Legacy direct/destructive               | CRITICAL |
| Assign course instructor | Course form -> legacy `instructorIds` update               | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change dates/schedule    | Course form -> legacy `dates` update                       | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change capacity          | Course form -> `totalSeats`/`availableSeats` update        | Legacy course authority                             | Legacy direct                           | HIGH     |
| Change price             | Course form -> `priceKZT` update                           | Legacy course authority                             | Legacy direct                           | HIGH     |
| Edit presentation        | Course form -> mixed course payload                        | Presentation can target the wrong aggregate         | Legacy direct                           | MEDIUM   |

T31B.1 blocks legacy updates to provisioned canonical Courses, but creation and
deletion remain separate risk paths.

### 2.3 Participant, account, instructor, and role mutations

| Capability           | UI to writer                                        | Destination/effect                                                  | Class                      | Risk     |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | -------- |
| Create client        | `ClientsManager` -> profile store/service `setDoc`  | `users/client_*` without canonical Account/Participant provisioning | Legacy direct              | HIGH     |
| Edit client profile  | `ClientsManager` -> profile service                 | `users/{id}`                                                        | Legacy direct              | HIGH     |
| Edit account balance | `ClientsManager` -> wallet transaction helper       | `users.balanceUSD` and `wallet_ledger`                              | Legacy direct money write  | CRITICAL |
| Delete client        | `ClientsManager` -> `profileService.deleteDoc`      | User deletion without Auth/Participant topology cleanup             | Legacy direct/destructive  | HIGH     |
| Promote/demote Admin | `AdminRoleManager` -> `profileService.updateDoc`    | `users/{id}.role`                                                   | Legacy direct; owner-gated | CRITICAL |
| Create instructor    | Clients/Coaches manager -> booking service `setDoc` | `instructors/{id}`                                                  | Legacy direct              | HIGH     |
| Edit instructor      | `CoachesManager` -> `setDoc` and batch propagation  | Instructor and denormalized legacy booking state                    | Legacy direct              | HIGH     |
| Delete instructor    | Clients/Coaches manager -> `deleteDoc`              | Instructor catalog deletion without canonical relationship cleanup  | Legacy direct              | HIGH     |

These paths maintain a dual authority:

- canonical `Participant`, `ParticipantManagement`, and relationships;
- legacy `users` and `instructors`.

The existing customer Participant panel uses canonical commands, but there is
no equivalent Admin Participant topology UI.

### 2.4 Finance and destructive system mutations

| Capability                                 | UI to writer                                                     | Destination/effect                                                     | Class                            | Risk     |
| ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- | -------- |
| Adjust guest wallet                        | `GuestWalletPanel` -> `adminService` -> guest wallet transaction | `settings/guest_wallet`, `wallet_ledger`                               | Legacy direct money write        | CRITICAL |
| Reset school finances                      | System settings -> `resetSchoolFinances`                         | Deletes ledger, resets balances, guest wallet and stats                | Legacy direct bulk destructive   | CRITICAL |
| Clear student bookings                     | System settings -> `clearStudentBookings`                        | Deletes bookings/messages/availability and rewrites course seats/stats | Legacy direct bulk destructive   | CRITICAL |
| Clear cancelled bookings                   | System settings -> clear helper                                  | Deletes bookings/messages/availability                                 | Legacy direct bulk destructive   | HIGH     |
| Edit starter credit and retention settings | Settings UI -> settings service                                  | `settings/*`                                                           | Legacy direct configuration      | MEDIUM   |
| Edit currency/USD-KZT rate                 | Financial overview/context -> merged config write                | `resort_data/config`                                                   | Presentation/config direct write | LOW      |

### 2.5 Other mutations

| Capability                   | UI to writer                                        | Destination/effect   | Class                            | Risk   |
| ---------------------------- | --------------------------------------------------- | -------------------- | -------------------------------- | ------ |
| Edit resort metadata/content | Product settings -> resort service                  | `resort_data/config` | Presentation/config direct write | LOW    |
| Delete error logs            | `ErrorLogsPanel` -> `adminService.deleteDoc`        | `error_logs/*`       | Operational cleanup              | LOW    |
| Post-action notification     | Admin actions/course service -> notification helper | `notifications/{id}` | Legacy direct side effect        | MEDIUM |

## 3. Course and CourseDay administration

### 3.1 Required topology

The migration must preserve:

```text
/courses/{courseId}
  strict canonical operational aggregate

/course_catalog_content/{courseId}
  presentation and translated content

/courses/{courseId}/days/{courseDayId}
  canonical CourseDays
```

The canonical Course document must not regain:

- `instructorIds`;
- `dates`;
- `totalSeats`;
- `availableSeats`;
- `priceKZT`;
- presentation or translation fields.

### 3.2 Existing canonical coverage

Available:

- `provision_canonical_course`;
- `apply_canonical_course_provisioning_manifest`;
- `create_course_day`;
- `reassign_course_day_instructor`;
- public/authenticated Course catalog read model;
- strict Course validation and legacy contamination guards.

The T31B pilot page exercises canonical provisioning, but it is not an active
production Admin workflow.

### 3.3 Exact gaps

Missing backend commands:

- amend canonical Course price;
- amend capacity;
- amend operational title or lifecycle metadata where required;
- hide/archive/reactivate a canonical Course;
- add instructor to `Course.instructorRosterIds`;
- remove instructor from `Course.instructorRosterIds`;
- reschedule a CourseDay;
- remove/cancel a CourseDay with resource-claim, enrollment, and attendance
  policy;
- safely delete or retire a canonical Course.

Missing read model:

- Admin Course aggregate metadata;
- catalog-content status/content;
- CourseDays;
- roster and actual instructor assignment;
- enrollment/capacity summary;
- revisions and allowed Admin actions.

The correct solution is intent-specific commands and an Admin projection, not
reintroducing a generic Course document editor.

## 4. Instructor assignment

Canonical authority is:

- `Course.instructorRosterIds` for the Course roster;
- `CourseDay.actualInstructorIds` for actual day assignment.

`instructorIds` must remain legacy-only and non-authoritative.

Coverage:

| Capability                              | Canonical status |
| --------------------------------------- | ---------------- |
| Create CourseDay with actual assignment | Exists           |
| Reassign CourseDay instructor           | Exists           |
| Add Course roster instructor            | Missing          |
| Remove Course roster instructor         | Missing          |
| Reschedule CourseDay                    | Missing          |
| Delete/cancel CourseDay                 | Missing          |
| Admin assignment read model             | Missing          |

The Admin UI still edits `instructorIds` through the legacy Course form and
uses legacy instructor documents. It has no canonical roster or CourseDay
assignment workflow.

## 5. CourseEnrollment administration

### 5.1 Current UI

There is no canonical Admin enrollment roster. `BookingsLog` displays legacy
`course_*` booking-shaped rows and applies generic booking actions to them.
Canonical `/course_enrollments` are not loaded for Admin.

### 5.2 Existing canonical commands

- `create_course_enrollments`;
- `withdraw_course_enrollment`;
- `request_course_enrollment_cancellation`;
- `resolve_course_enrollment_cancellation`;
- `transfer_course_enrollment`;
- `link_guest_course_enrollment_to_account`;
- `confirm_guest_course_enrollment` (added by T32.8C; payment-funded, not unpaid approval);
- `reconcile_course_enrollment`;
- `record_course_day_attendance`;
- `resolve_attendance_outcome`.

### 5.3 Read-model coverage

Existing scopes:

- `account_hot`;
- `account_history`;
- `instructor_roster`;
- `guest_single`.

Missing:

- school-wide Admin roster;
- enrollment detail by ID;
- guest pending-payment queue (historical audit said “guest approval queue”; that unpaid-approval reading is superseded by ADR-0007);
- Admin-authorized action flags;
- cancellation/refund/reconciliation summary;
- transfer target eligibility.

### 5.4 Exact command gaps

- `transfer_course_enrollment` has a handler whose authorization requires
  `admin_callable`, but the callable account-context allowlist does not route
  this command kind as an administrator command.
- Guest enrollment linking is account-owner self-service; no canonical
  administrator-assisted linking path exists. **Superseded after T32.8B PASS:**
  Admin-assisted `existing_managed` linking exists and is not confirmation.
- No explicit guest enrollment approval command/UI was found.
  **Superseded after T32.8C PASS:** payment-funded confirmation is the
  canonical policy, and `confirm_guest_course_enrollment` is the implemented
  lifecycle transition. Unpaid Administrator approval is not a supported
  command.
- No Admin frontend wiring exists for cancellation resolution,
  reconciliation, transfer, or financial correction.

The frontend must not recreate transfer, cancellation, refund, or eligibility
rules.

## 6. Lesson booking administration

### 6.1 Current UI

Admin uses:

- `BookingsLog` for filtering, confirmation, cancellation, completion, and
  guest linking;
- `ScheduleCalendar` and `ScheduleSlotActionModal` for creation, movement,
  instructor reassignment, cancellation, completion, and deletion.

All active mutations use legacy callables.

### 6.2 Existing canonical coverage

Canonical command kinds/handlers cover:

- confirmed booking creation;
- guest booking requests;
- guest booking confirmation (`confirm_guest_booking` requires fully funded
  Payment; it is not an unpaid Admin override — see ADR-0007);
- cancellation request and resolution;
- change-request resolution;
- rescheduling;
- instructor, duration, and party changes;
- attendance recording and resolution;
- payment start gate;
- guest self-linking.

### 6.3 Exact gaps

- No Admin lesson booking read-model scope exists.
- `complete_booking` is declared as a command kind but has no registered
  production handler.
- Admin callable routing does not assign `admin_callable` to reschedule or
  instructor-change command kinds.
- Canonical guest linking is account-owner self-service; the current Admin
  target-account linking workflow has no equivalent canonical command.
  **Superseded after T32.8B PASS:** Admin-assisted `existing_managed` linking
  exists and is not confirmation.
- Admin approval/rejection of cancellation requests invokes legacy
  cancel/confirm callables instead of `resolve_booking_cancellation`.
- Admin guest confirmation invokes legacy `confirmBooking` instead of
  `confirm_guest_booking`. **Policy superseded by ADR-0007 / T32.8C:** the
  canonical command is a payment-funded `pending → confirmed` transition, not
  unpaid Administrator approval. Removal of unreachable leftover
  `confirmBooking` wiring remains T32.9B after T32.9A proves the useful
  guest-confirmation capability is preserved on the canonical path.

## 7. Payments and Wallet

### 7.1 Current UI

Admin currently reads or mutates:

- `users.balanceUSD`;
- `settings/guest_wallet`;
- `wallet_ledger`;
- old booking payment and refund fields;
- calculated financial totals over legacy bookings.

It does not use canonical Payment, Wallet, or MonetaryEvent projections.

### 7.2 Existing canonical commands

- `record_manual_wallet_funding`;
- `record_provider_payment_event`;
- `adjust_service_price`;
- `record_financial_correction`;
- `record_audit_correction`;
- `enforce_payment_start_gate`.

### 7.3 Gaps

Missing Admin projections and UI for:

- account Wallet balance and revision;
- Payment lifecycle and provider state;
- MonetaryEvent history;
- retained and settled amounts;
- manual funding;
- refunds and corrections;
- payment reconciliation;
- links from AdminIssue to Payment, booking, enrollment, and attendance.

Direct balance editing, guest-wallet adjustment, ledger deletion, and
legacy cancellation refunds are CRITICAL until replaced.

## 8. AdminIssue and attendance

The canonical backend can create `attendance_payment_conflict`,
`payment_required_at_start`, and other policy-defined AdminIssues. It supports
attendance outcome and financial/audit correction commands.

Current Admin UI has:

- no AdminIssue inbox;
- no issue detail;
- no severity/status filtering;
- no subject deep links;
- no issue-driven authorized actions;
- no attendance correction UI;
- no payment-start issue UI.

The AdminIssue policy intentionally couples issue resolution to the domain
action that resolves the underlying problem. A generic “mark resolved” button
should not bypass those policies.

Required read model:

- open and historical issues;
- severity and lifecycle;
- subject references;
- evidence and payment/attendance summary;
- current revisions;
- blocking conditions;
- allowed coupled resolution actions.

## 9. Participant and account administration

### 9.1 Current state

`ClientsManager` directly manages `users` documents. `CoachesManager` directly
manages `instructors`. The Admin UI does not understand:

- canonical Participants;
- account ownership;
- `ParticipantManagement`;
- assignment and revocation;
- duplicate identities;
- damaged management topology;
- blocked Participants;
- instructor relationships.

### 9.2 Existing canonical coverage

Commands exist for:

- Participant creation and profile update;
- management assignment and revocation;
- instructor relationship creation and revocation;
- Participant block/unblock.

The customer cabinet already uses canonical Participant commands, but Admin
does not.

### 9.3 Gaps

- Admin account/Participant directory read model;
- account-to-Participant ownership and management topology;
- damaged/duplicate-state diagnostics;
- safe repair workflows;
- Admin UI for management assignment/revocation;
- canonical account role command;
- canonical instructor catalog CRUD separated from instructor relationships,
  Course roster, and CourseDay assignment.

## 10. Read-model audit

| Admin screen          | Current source                               | Canonical availability                   | Required extension                                                        |
| --------------------- | -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| Schedule/BookingsLog  | Raw legacy bookings plus paged history       | Account/instructor/guest lesson scopes   | Admin hot/history/detail, authorized actions, payment and issue summaries |
| CoursesManager        | Client join of `courses` and catalog content | Public catalog only                      | Aggregate, content, CourseDays, roster, revisions and provisioning state  |
| Enrollment roster     | Legacy course-shaped booking rows            | Account/instructor/guest scopes          | Admin roster/detail and actions                                           |
| Finance               | Ledger, `balanceUSD`, guest-wallet settings  | No Admin finance projection              | Payment, Wallet, MonetaryEvent and reconciliation                         |
| AdminIssue            | None                                         | No Admin projection                      | Inbox, history, detail, subject links and coupled actions                 |
| People                | Raw `users` and `instructors`                | Account-scoped managed Participant reads | Admin account/Participant topology and diagnostics                        |
| Instructor assignment | Legacy `instructorIds` and raw instructors   | Instructor-scoped assignment projection  | Admin Course roster and CourseDay assignment                              |

Admin currently mixes multiple pagination models:

- client pagination over separately paged booking history;
- client pagination over a growing user collection limit;
- client pagination over a growing wallet-ledger limit.

Snapshot errors are often logged without screen-level recovery. The canonical
Admin shell should standardize:

- server cursor pagination;
- loading, empty, error, and retry states;
- revision-aware merging;
- stale-response protection;
- server-authorized action flags;
- URL-addressable list/detail state.

## 11. Security and authorization

### 11.1 Existing sound boundaries

- Canonical collections are protected by default-deny Firestore Rules.
- Canonical callables resolve authenticated account and capability server-side.
- Administrator command kinds are explicitly allowlisted.
- T31B.1 blocks legacy updates to provisioned canonical Courses.
- System-owner Rules protect Admin role changes.

### 11.2 Legacy permissions preserving current UI

The Admin UI currently works because Rules allow:

- broad updates of non-Admin `users`, including legacy balances;
- Admin create/delete access to `wallet_ledger`;
- Admin CRUD on `instructors`;
- broad Admin writes to `settings`;
- Admin Course creation and deletion;
- presentation/configuration writes to `resort_data`.

Legacy booking callables use Admin SDK and their own role checks rather than
canonical command authorization.

Rules must not be weakened. They should be tightened collection by collection
after each canonical replacement is live. Immediate containment should close
strict canonical Course deletion and destructive/money risks first.

## 12. Test inventory

| Layer           | Existing coverage                                                                                                          | High-risk gap                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Unit/domain     | Strong canonical policy coverage for booking, enrollment, finance, attendance, Participants, claims, revisions, AdminIssue | Sparse Admin component behavior; several wiring tests are source-string assertions                          |
| Component       | Booking log cancellation, Course delete, non-Admin Participant panel                                                       | No meaningful Schedule, wallet, cash flow, client, coach, role, issue, or canonical Admin workflow coverage |
| Callable        | Legacy booking callables and canonical transport                                                                           | No Admin UI-to-canonical callable integration                                                               |
| Emulator        | Strong canonical finance, cancellation, CourseDay, enrollment, attendance and reconciliation suites                        | No end-to-end Admin projection and command workflow                                                         |
| Firestore Rules | Booking denial, roles, ledger, resort and Course contamination cases                                                       | Existing tests preserve Admin balance inflation and ledger deletion; no post-migration denial suite         |
| E2E             | Customer booking and canonical invariants                                                                                  | No `/admin` navigation or critical Admin workflow                                                           |

High-priority missing tests:

1. strict canonical Course cannot be deleted through the client;
2. Admin cannot directly mutate canonical or legacy monetary authority;
3. destructive reset controls cannot affect canonical production state;
4. AdminIssue inbox and coupled resolution workflow;
5. canonical lesson cancellation/refund from Admin;
6. canonical CourseEnrollment cancellation/transfer;
7. Course roster and CourseDay assignment revisions;
8. Participant management assignment/revocation and damaged state;
9. one browser E2E per critical Admin vertical slice.

## 13. Capability matrix

| Capability                                         | Current write source               | Canonical backend                                                                                           | Canonical Admin read model | Risk     | Main gap                                                                                   | Slice                   |
| -------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| Safety/destructive controls                        | Direct writes and batches          | Partial guards only                                                                                         | No                         | CRITICAL | Canonical Course delete and direct money/reset paths                                       | T32.1                   |
| AdminIssue inbox/detail                            | None                               | Issue policy/store exists                                                                                   | No                         | HIGH     | List/detail and coupled actions                                                            | T32.2                   |
| Manual Wallet funding                              | Direct balance/guest-wallet writes | Exists                                                                                                      | No                         | CRITICAL | Wallet projection and command UI                                                           | T32.3                   |
| Refund/correction                                  | Legacy booking cancellation        | Exists                                                                                                      | No                         | CRITICAL | Payment/Wallet/MonetaryEvent detail                                                        | T32.3                   |
| Lesson Admin list/detail                           | Legacy raw bookings                | Commands mostly exist                                                                                       | No                         | HIGH     | Admin read scope                                                                           | T32.4                   |
| Admin lesson create                                | Legacy `addBooking`                | Exists with Admin context                                                                                   | No                         | HIGH     | Frontend hook and read scope                                                               | T32.4                   |
| Guest lesson pending-payment confirmation          | Legacy `confirmBooking`            | Payment-funded `confirm_guest_booking` (T32.8C PASS)                                                        | Partial                    | HIGH     | Unpaid Admin override is forbidden; leftover unreachable UI is T32.9B after T32.9A parity  | T32.4 / T32.8C          |
| Lesson cancellation                                | Legacy cancel/confirm              | Exists                                                                                                      | No                         | CRITICAL | Canonical resolve/refund UX                                                                | T32.3/T32.4             |
| Lesson reschedule/reassign                         | Legacy schedule callable           | Handlers exist                                                                                              | No                         | HIGH     | Admin callable routing                                                                     | T32.4                   |
| Lesson completion                                  | Legacy callable                    | Command kind only                                                                                           | No                         | HIGH     | Missing production handler                                                                 | T32.4                   |
| Guest lesson linking                               | Legacy Admin callable              | Admin `existing_managed` (T32.8B PASS)                                                                      | Partial                    | HIGH     | Linking is not confirmation                                                                | T32.8B                  |
| Canonical Course create                            | Direct `setDoc` legacy form        | Provisioning exists                                                                                         | No                         | HIGH     | Production Admin workflow                                                                  | T32.5                   |
| Course operational amend                           | Direct `updateDoc`                 | Missing                                                                                                     | No                         | HIGH     | Intent-specific commands                                                                   | T32.5                   |
| Catalog content edit                               | Mixed legacy Course payload        | Missing dedicated command                                                                                   | No                         | LOW      | Isolate `course_catalog_content`                                                           | T32.5                   |
| Course roster assignment                           | Legacy `instructorIds`             | Missing                                                                                                     | No                         | HIGH     | Add/remove roster commands                                                                 | T32.5                   |
| CourseDay create/reassign                          | Legacy date/instructor fields      | Exists                                                                                                      | No                         | HIGH     | UI and Admin projection                                                                    | T32.5                   |
| CourseDay reschedule/remove                        | Legacy date edits                  | Missing                                                                                                     | No                         | HIGH     | Commands and policy                                                                        | T32.5                   |
| Enrollment roster/detail                           | Legacy course-shaped bookings      | Domain exists                                                                                               | No                         | HIGH     | Admin roster scope                                                                         | T32.6                   |
| Enrollment cancellation                            | Legacy booking actions             | Exists                                                                                                      | No                         | CRITICAL | Canonical resolve/refund UX                                                                | T32.6                   |
| Enrollment transfer                                | None                               | Handler exists                                                                                              | No                         | HIGH     | Admin callable routing                                                                     | T32.6                   |
| Guest enrollment pending-payment confirmation/link | Legacy/none                        | Payment-funded `confirm_guest_course_enrollment` (T32.8C PASS); Admin `existing_managed` link (T32.8B PASS) | Partial                    | HIGH     | Unpaid Admin approval is not policy; leftover unreachable UI is T32.9B after T32.9A parity | T32.6 / T32.8B / T32.8C |
| Attendance correction                              | Instructor UI only                 | Exists                                                                                                      | No                         | HIGH     | Admin correction workflow                                                                  | T32.7                   |
| Participant/account Admin                          | Direct `users` CRUD                | Mostly exists                                                                                               | No                         | HIGH     | Admin topology/diagnostics                                                                 | T32.8                   |
| Management assignment/revoke                       | None                               | Exists                                                                                                      | No                         | HIGH     | Admin UI/read model                                                                        | T32.8                   |
| Instructor catalog CRUD                            | Direct `instructors` CRUD          | Missing                                                                                                     | No                         | HIGH     | Separate catalog commands/read model                                                       | T32.8                   |
| Resort/settings content                            | Direct configuration writes        | Not a canonical business domain                                                                             | Not required               | LOW      | Keep isolated; leftover write cleanup is T32.9B after parity                               | T32.9B                  |

## 14. Recommended implementation slices

### T32.1 — Safety containment

Scope:

- prevent legacy client deletion or replacement of strict canonical Courses;
- disable or isolate direct user balance and guest-wallet adjustment;
- disable or isolate finance reset and bulk booking reset tools;
- add Rules and emulator regression tests;
- preserve T31B.1 strict validation and contamination guards.

Reason for first position:

- the current UI can corrupt authoritative money and Course state today;
- containment does not depend on new projections;
- later work can proceed behind a safer boundary.

### T32.2 — Canonical Admin data shell and AdminIssue inbox

Scope:

- common Admin query client and authorization contract;
- cursor pagination, loading/error/retry and revision handling;
- AdminIssue list, detail, filters and deep links;
- server-provided authorized actions;
- no frontend joining of raw canonical collections.

Reason:

- creates the read/authentication spine used by every later slice;
- immediately exposes conflicts already produced by the canonical backend.

### T32.3 — Canonical Payment/Wallet vertical slice

Scope:

- Payment, Wallet, and MonetaryEvent Admin projections;
- manual wallet funding;
- canonical cancellation refunds and financial corrections;
- audit correction and reconciliation UX;
- remove direct `balanceUSD`, guest-wallet, and ledger mutations from Admin.

Reason:

- money is the highest-risk authoritative domain after containment;
- booking and enrollment Admin actions need canonical financial effects.

### T32.4 — Canonical lesson booking administration

Scope:

- Admin hot/history/detail lesson projections;
- create-on-behalf;
- guest pending-payment confirmation (not unpaid Admin approval);
- cancellation resolution;
- reschedule and instructor change;
- completion;
- guest identity linking (`existing_managed`; not confirmation);
- fix administrator callable routing;
- implement/register `complete_booking` or deliberately replace its contract.

Reason:

- removes the large legacy booking callable surface;
- depends on the read shell and finance workflows.

### T32.5 — Canonical Course and CourseDay administration

Scope:

- manifest-based Course creation;
- Admin Course aggregate/content/day projection;
- named operational amendments;
- roster add/remove commands;
- CourseDay create/reassign/reschedule/remove;
- presentation editing only in `course_catalog_content`;
- archive/retire policy instead of raw delete.

Reason:

- replaces the currently blocked legacy Course form without compromising strict
  Course topology.

### T32.6 — Canonical CourseEnrollment administration

Scope:

- Admin enrollment roster/detail;
- create-on-behalf;
- guest identity linking (`existing_managed`; not confirmation);
- payment-funded guest confirmation (`confirm_guest_course_enrollment`; does not consume another seat);
- cancellation resolution;
- transfer callable routing;
- reconciliation and related financial actions.

Reason:

- depends on canonical Course/CourseDay and finance projections.

### T32.7 — Attendance and issue resolution UX

Scope:

- Admin attendance correction;
- reason/evidence capture;
- payment-start issue handling;
- `resolve_attendance_outcome`;
- reconciliation actions driven by AdminIssue and read-model permissions.

Reason:

- depends on canonical booking/enrollment detail screens and the issue inbox.

### T32.8 — Participant, account, and instructor administration

Scope:

- canonical account/Participant topology directory;
- management assignment/revocation;
- blocked and damaged-state diagnostics;
- safe repair workflows;
- canonical account role mutation;
- instructor catalog commands separated from relationships and assignments.

Reason:

- replaces broad `users`/`instructors` permissions without conflating identity,
  management, catalog, and assignment authorities.

#### T32.8A — Canonical identity administration — PASS

Account administration, Participant administration, ParticipantManagement
topology, Account → managed Participant selection, identity/instructor
authority, and Firestore Rules containment. Guest email, phone, and display
name remain diagnostic evidence, not identity authority.

#### T32.8B — Admin-assisted guest identity linking — PASS

`existing_managed` linking for Guest Lesson Booking and Guest CourseEnrollment.
Linking is not confirmation, does not fund Payment, and does not consume or
release capacity. Unused unmanaged guest Participant cleanup is deferred.

#### T32.8C — Payment-Driven Guest Confirmation — PASS

Formerly: Deferred Guest Approval Policy Review. That name and unpaid
Administrator-approval reading are superseded.

Payment-funded confirmation for Guest Lesson Booking and Guest CourseEnrollment:
`isPaymentFullyFundedForService` in the same financial Firestore transaction,
with rare divergence recovered by AdminIssue plus the idempotent
`guestConfirmationReconciliationSweep`. `confirm_guest_booking` and
`confirm_guest_course_enrollment` reuse the lifecycle transition and cannot
confirm unpaid subjects. CourseEnrollment confirmation does not consume another
seat.

### T32.9A — Admin UX Restoration & Canonical Integration

Purpose: recover missing historical Admin UX; preserve useful information and
interactions; integrate new canonical functionality; prove feature parity;
identify legacy implementations safe for later removal; complete FINAL
CANONICAL CUTOVER under T32.9A.9 (9A–9E, including 9P and 9D0).

T32.9A is **not** broad legacy UI cleanup. Specific Admin capability inventories
belong here, not in the global [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)
rule.

Current structure (authoritative for later status; see preamble):

- **T32.9A.8** Canonical Courses UX — PASS / CLOSED (8A/8B/8C)
- **T32.9A.9** FINAL CANONICAL CUTOVER
  - **9A** Individual Booking lifecycle cutover — **PASS / CLOSED** (core PASS at
    authority level; F1 PASS/DEPLOYED; F2/F3/F4 PASS/CLOSED; F5 PASS/CLOSED with production expiry smoke PASS 2026-09-16; final integration/production smoke PASS)
  - **Admin Lessons + Courses consolidation** — **PASS / DEPLOYED / RUNTIME VERIFIED** (authenticated production smoke PASS 2026-09-16)
  - **9B** Student Booking Stats / Progress / Recommendations Cutover, including Reviews / Instructor Rating Continuity — **PASS / CLOSED**
    - **9B.2** Canonical Participant Progress — **PASS / CLOSED** (production smoke 2026-09-11)
    - **9B.3** Recommendations / Lesson Feedback continuity — **PASS / CLOSED** (production smoke 2026-09-12)
    - **9B.4** Stats / Achievements — **PASS / CLOSED**
    - **Reviews / Instructor Rating Continuity** — **PASS / CLOSED**
  - **T32.9R** Firestore / server-resource optimization — parallel track; see preamble **T32.9R** (R1 **DEFERRED / BLOCKED**, R2 **DEFERRED**; next = deploy/verify READY items + re-measure)
  - **#42** account_hot page-1 reconciliation >25 correctness — recorded T32.9R follow-up (`P0B-PRUNE`; not an R-ticket; not a 9E blocker)
  - **9C** Course Progress / Achievements Cutover — **PASS / CLOSED**
  - **9P** Global Product Parity & Legacy Dependency Gate — **PASS / CLOSED** (source / current production client)
  - **9D0** Production-like Incremental Cutover Rehearsal — **PASS / CLOSED** (exact source manifest; data delete NONE; production Function delete gated by inventory only)
  - **9D** Selective Destructive Legacy Data Cleanup — **PASS / CLOSED** (physical source cleanup 2026-09-16; leftover source counters = 0; historical data untouched; no production Function delete)
  - **9E** Canonical Authority / Reachability Gate — NEXT (technical + product)

Scope:

- restore useful historical Admin screens, information density, planner,
  finance, People, monitoring, filtering, and operational workflows on
  canonical read models and commands;
- add new canonical UX where required (AdminIssue actions, Payment detail,
  Account / Participant topology; Admin guest payment capture under 9A.F1 is PASS/DEPLOYED);
- complete individual Booking, progress/recommendations, and Course progress
  authority cutovers, then 9P global parity, then 9D0 rehearsal, before selective leftover data disposal;
- prove information, action, and interaction parity before any leftover
  implementation is treated as removable;
- record the 9P UX parity inventory (`PASS` / `PARTIAL` / `MISSING` /
  `NEEDS_PRODUCT_DECISION`). 9D is forbidden on non-PASS rows without an
  explicit Product Owner decision.

Reason:

- Admin migration must preserve product capability while replacing legacy
  authority. A canonical backend without the previous useful Admin UX is not
  a finished Admin slice.

### T32.9B — Final Legacy Write / Runtime Cleanup

**T32.9B is PASS / CLOSED (2026-09-18)** after T32.9A.9E. It removed leftover
implementations only after useful product capability had a canonical
replacement. Remaining deferred items are classified in the T32.9B close
section above and are not leftover authority.

Scope:

- remove Admin dependencies on legacy booking, Course, profile, instructor, and
  wallet wrappers that T32.9A has replaced with proven-parity canonical paths;
- dead leftover Booking services, `useBookingActions`, old callable adapters,
  leftover Course services/callables, availability compatibility,
  `guest_wallet` / USD compatibility, V1 Course read-model compatibility,
  temporary adapters, obsolete Rules/indexes, and dead tests/fixtures;
- tighten Firestore Rules for each migrated collection;
- retire unreachable leftover helpers, including superseded unpaid-approval
  terminology/UI, unused legacy Guest linking UI, and old bundled
  `confirmBooking` helpers where they remain after the useful confirmation
  capability is preserved on the canonical path;
- retain only explicitly non-canonical presentation/configuration writes.

Reason:

- all replacement workflows must be live and UX-parity verified before final
  denial and removal.

## 15. Start recommendation

Start **T32.1 — Safety containment**.

The current runtime can directly change money, delete financial history,
perform bulk destructive resets, and delete a strict canonical Course despite
the T31B.1 update guard. These are higher-priority risks than missing Admin
features. T32.1 is small, independent of new read models, and provides a safe
base for T32.2 and every subsequent vertical slice.
