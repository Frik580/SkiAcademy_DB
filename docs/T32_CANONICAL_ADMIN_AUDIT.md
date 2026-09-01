# T32 Canonical Admin Audit Report

Date: 2026-08-30  
Amended: 2026-09-01 — T32.8A, T32.8B, and T32.8C PASS; guest confirmation policy recorded in [ADR-0007](adr/0007-guest-identity-payment-and-confirmation.md); T32.9 split and global UX preservation recorded in [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)

Status: historical Admin-runtime audit from 2026-08-30, with later T32.8A–T32.8C and T32.9A/T32.9B migration status below. Findings in this document that describe unpaid Administrator guest approval, missing guest CourseEnrollment confirmation, or identity linking as confirmation are superseded by ADR-0007.

## Later migration status: T32.8A–T32.8C and T32.9

| Slice | Name | Status |
|---|---|---|
| T32.8A | Canonical identity administration (Account, Participant, ParticipantManagement, Account → managed Participant selector) | PASS |
| T32.8B | Admin-assisted guest identity linking (`existing_managed`) | PASS |
| T32.8C | Payment-Driven Guest Confirmation | PASS |

T32.8C was previously scoped as a deferred guest-approval policy review. That name and unpaid-approval reading are superseded. T32.8C implements payment-funded guest confirmation for Lesson Booking and CourseEnrollment.

Explicitly deferred after T32.8C:

- `pay_on_site`, cash-at-start, deferred payment, and unpaid Admin override;
- partially-paid pending guest rejection or refund policy;
- unused unmanaged guest Participant cleanup.

T32.9 is split. This audit amendment does not start either slice.

| Slice | Name | Status |
|---|---|---|
| T32.9A | Admin UX Restoration & Canonical Integration | not started |
| T32.9B | Final Legacy Write / Runtime Cleanup | not started; blocked on T32.9A parity |

T32.9A recovers missing historical Admin UX, preserves useful information and interactions, integrates new canonical functionality, proves feature parity, and identifies legacy implementations safe for later removal. It is not broad legacy UI cleanup.

T32.9B may remove a leftover implementation only after its useful product capability has a canonical replacement and UX parity is proven. Unreachable leftover helpers such as old bundled `confirmBooking`, superseded unpaid-approval terminology, and unused legacy Guest linking UI remain T32.9B after that gate. See [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md).

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

| Tab | Active screens | Current authority |
|---|---|---|
| Shared header | `FinancialOverview` | Legacy `bookings` and `school_global_stats` |
| Operations | `ScheduleCalendar`, `BookingsLog` | Legacy `Booking[]` and booking callables |
| Finance | `GuestWalletPanel`, `CashFlowPanel` | `settings/guest_wallet`, `wallet_ledger` |
| People | `ClientsManager`, `CoachesManager`, `AdminRoleManager` | `users`, `instructors` |
| Product | `CoursesManager`, resort content/settings | Legacy Course shape, `resort_data` |
| System | Settings, destructive reset tools, error logs | `settings`, `bookings`, `wallet_ledger`, `users`, `error_logs` |

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

| Capability | UI to writer | Destination/effect | Class | Risk |
|---|---|---|---|---|
| Create lesson, break, or day-off | `ScheduleSlotActionModal` -> `useAdminActions` -> `addBooking` callable | `bookings`, balances, availability and ledger state | Hybrid legacy | HIGH |
| Confirm pending lesson | `BookingsLog` -> `confirmBookingService` -> `confirmBooking` callable | Legacy booking lifecycle and availability | Hybrid legacy | HIGH |
| Complete lesson | `BookingsLog`/Schedule -> `completeBookingService` -> `completeBooking` callable | Legacy bookings, activity and availability | Hybrid legacy | HIGH |
| Cancel/refund lesson | `BookingsLog`/Schedule -> `cancelBookingService` -> `cancelBooking` callable | Booking state, user/guest balance, ledger and availability | Hybrid legacy | CRITICAL |
| Approve cancellation request | `BookingsLog` -> `cancelBooking` | Legacy cancellation and refund logic | Semantic mismatch; hybrid legacy | CRITICAL |
| Reject cancellation request | `BookingsLog` -> `confirmBooking` | Restores legacy confirmed status | Semantic mismatch; hybrid legacy | CRITICAL |
| Reschedule lesson | `ScheduleSlotActionModal` -> `updateBookingSchedule` callable | Booking schedule and availability locks | Hybrid legacy | HIGH |
| Reassign lesson instructor | Same schedule callable | Booking, pricing/balance and availability | Hybrid legacy | CRITICAL |
| Link guest lesson to account | `LinkGuestBookingModal` -> `linkGuestBooking` callable | Rewrites booking ownership and related legacy data | Hybrid legacy | HIGH |
| Delete booking or block | Schedule -> `deleteBooking` callable | Booking, availability, course/stats side effects | Hybrid legacy/destructive | HIGH |

### 2.2 Course mutations

| Capability | UI to writer | Destination/effect | Class | Risk |
|---|---|---|---|---|
| Create or clone course | `CoursesManager`/`useCourseForm` -> `courseService.setDoc` | Flat legacy `/courses/{id}` document | Legacy direct | HIGH |
| Edit course | `CoursesManager` -> `courseService.updateDoc` | Legacy operational and presentation fields | Legacy direct; canonical update guarded | HIGH |
| Hide/show or reorder | `CoursesManager` -> `courseService.updateDoc` | Legacy course fields | Legacy direct; canonical update guarded | HIGH |
| Delete course | `CoursesManager` -> `courseService.deleteDoc` | Deletes `/courses/{id}` without a canonical cascade | Legacy direct/destructive | CRITICAL |
| Assign course instructor | Course form -> legacy `instructorIds` update | Legacy course authority | Legacy direct | HIGH |
| Change dates/schedule | Course form -> legacy `dates` update | Legacy course authority | Legacy direct | HIGH |
| Change capacity | Course form -> `totalSeats`/`availableSeats` update | Legacy course authority | Legacy direct | HIGH |
| Change price | Course form -> `priceKZT` update | Legacy course authority | Legacy direct | HIGH |
| Edit presentation | Course form -> mixed course payload | Presentation can target the wrong aggregate | Legacy direct | MEDIUM |

T31B.1 blocks legacy updates to provisioned canonical Courses, but creation and
deletion remain separate risk paths.

### 2.3 Participant, account, instructor, and role mutations

| Capability | UI to writer | Destination/effect | Class | Risk |
|---|---|---|---|---|
| Create client | `ClientsManager` -> profile store/service `setDoc` | `users/client_*` without canonical Account/Participant provisioning | Legacy direct | HIGH |
| Edit client profile | `ClientsManager` -> profile service | `users/{id}` | Legacy direct | HIGH |
| Edit account balance | `ClientsManager` -> wallet transaction helper | `users.balanceUSD` and `wallet_ledger` | Legacy direct money write | CRITICAL |
| Delete client | `ClientsManager` -> `profileService.deleteDoc` | User deletion without Auth/Participant topology cleanup | Legacy direct/destructive | HIGH |
| Promote/demote Admin | `AdminRoleManager` -> `profileService.updateDoc` | `users/{id}.role` | Legacy direct; owner-gated | CRITICAL |
| Create instructor | Clients/Coaches manager -> booking service `setDoc` | `instructors/{id}` | Legacy direct | HIGH |
| Edit instructor | `CoachesManager` -> `setDoc` and batch propagation | Instructor and denormalized legacy booking state | Legacy direct | HIGH |
| Delete instructor | Clients/Coaches manager -> `deleteDoc` | Instructor catalog deletion without canonical relationship cleanup | Legacy direct | HIGH |

These paths maintain a dual authority:

- canonical `Participant`, `ParticipantManagement`, and relationships;
- legacy `users` and `instructors`.

The existing customer Participant panel uses canonical commands, but there is
no equivalent Admin Participant topology UI.

### 2.4 Finance and destructive system mutations

| Capability | UI to writer | Destination/effect | Class | Risk |
|---|---|---|---|---|
| Adjust guest wallet | `GuestWalletPanel` -> `adminService` -> guest wallet transaction | `settings/guest_wallet`, `wallet_ledger` | Legacy direct money write | CRITICAL |
| Reset school finances | System settings -> `resetSchoolFinances` | Deletes ledger, resets balances, guest wallet and stats | Legacy direct bulk destructive | CRITICAL |
| Clear student bookings | System settings -> `clearStudentBookings` | Deletes bookings/messages/availability and rewrites course seats/stats | Legacy direct bulk destructive | CRITICAL |
| Clear cancelled bookings | System settings -> clear helper | Deletes bookings/messages/availability | Legacy direct bulk destructive | HIGH |
| Edit starter credit and retention settings | Settings UI -> settings service | `settings/*` | Legacy direct configuration | MEDIUM |
| Edit currency/USD-KZT rate | Financial overview/context -> merged config write | `resort_data/config` | Presentation/config direct write | LOW |

### 2.5 Other mutations

| Capability | UI to writer | Destination/effect | Class | Risk |
|---|---|---|---|---|
| Edit resort metadata/content | Product settings -> resort service | `resort_data/config` | Presentation/config direct write | LOW |
| Delete error logs | `ErrorLogsPanel` -> `adminService.deleteDoc` | `error_logs/*` | Operational cleanup | LOW |
| Post-action notification | Admin actions/course service -> notification helper | `notifications/{id}` | Legacy direct side effect | MEDIUM |

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

| Capability | Canonical status |
|---|---|
| Create CourseDay with actual assignment | Exists |
| Reassign CourseDay instructor | Exists |
| Add Course roster instructor | Missing |
| Remove Course roster instructor | Missing |
| Reschedule CourseDay | Missing |
| Delete/cancel CourseDay | Missing |
| Admin assignment read model | Missing |

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

| Admin screen | Current source | Canonical availability | Required extension |
|---|---|---|---|
| Schedule/BookingsLog | Raw legacy bookings plus paged history | Account/instructor/guest lesson scopes | Admin hot/history/detail, authorized actions, payment and issue summaries |
| CoursesManager | Client join of `courses` and catalog content | Public catalog only | Aggregate, content, CourseDays, roster, revisions and provisioning state |
| Enrollment roster | Legacy course-shaped booking rows | Account/instructor/guest scopes | Admin roster/detail and actions |
| Finance | Ledger, `balanceUSD`, guest-wallet settings | No Admin finance projection | Payment, Wallet, MonetaryEvent and reconciliation |
| AdminIssue | None | No Admin projection | Inbox, history, detail, subject links and coupled actions |
| People | Raw `users` and `instructors` | Account-scoped managed Participant reads | Admin account/Participant topology and diagnostics |
| Instructor assignment | Legacy `instructorIds` and raw instructors | Instructor-scoped assignment projection | Admin Course roster and CourseDay assignment |

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

| Layer | Existing coverage | High-risk gap |
|---|---|---|
| Unit/domain | Strong canonical policy coverage for booking, enrollment, finance, attendance, Participants, claims, revisions, AdminIssue | Sparse Admin component behavior; several wiring tests are source-string assertions |
| Component | Booking log cancellation, Course delete, non-Admin Participant panel | No meaningful Schedule, wallet, cash flow, client, coach, role, issue, or canonical Admin workflow coverage |
| Callable | Legacy booking callables and canonical transport | No Admin UI-to-canonical callable integration |
| Emulator | Strong canonical finance, cancellation, CourseDay, enrollment, attendance and reconciliation suites | No end-to-end Admin projection and command workflow |
| Firestore Rules | Booking denial, roles, ledger, resort and Course contamination cases | Existing tests preserve Admin balance inflation and ledger deletion; no post-migration denial suite |
| E2E | Customer booking and canonical invariants | No `/admin` navigation or critical Admin workflow |

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

| Capability | Current write source | Canonical backend | Canonical Admin read model | Risk | Main gap | Slice |
|---|---|---|---|---|---|---|
| Safety/destructive controls | Direct writes and batches | Partial guards only | No | CRITICAL | Canonical Course delete and direct money/reset paths | T32.1 |
| AdminIssue inbox/detail | None | Issue policy/store exists | No | HIGH | List/detail and coupled actions | T32.2 |
| Manual Wallet funding | Direct balance/guest-wallet writes | Exists | No | CRITICAL | Wallet projection and command UI | T32.3 |
| Refund/correction | Legacy booking cancellation | Exists | No | CRITICAL | Payment/Wallet/MonetaryEvent detail | T32.3 |
| Lesson Admin list/detail | Legacy raw bookings | Commands mostly exist | No | HIGH | Admin read scope | T32.4 |
| Admin lesson create | Legacy `addBooking` | Exists with Admin context | No | HIGH | Frontend hook and read scope | T32.4 |
| Guest lesson pending-payment confirmation | Legacy `confirmBooking` | Payment-funded `confirm_guest_booking` (T32.8C PASS) | Partial | HIGH | Unpaid Admin override is forbidden; leftover unreachable UI is T32.9B after T32.9A parity | T32.4 / T32.8C |
| Lesson cancellation | Legacy cancel/confirm | Exists | No | CRITICAL | Canonical resolve/refund UX | T32.3/T32.4 |
| Lesson reschedule/reassign | Legacy schedule callable | Handlers exist | No | HIGH | Admin callable routing | T32.4 |
| Lesson completion | Legacy callable | Command kind only | No | HIGH | Missing production handler | T32.4 |
| Guest lesson linking | Legacy Admin callable | Admin `existing_managed` (T32.8B PASS) | Partial | HIGH | Linking is not confirmation | T32.8B |
| Canonical Course create | Direct `setDoc` legacy form | Provisioning exists | No | HIGH | Production Admin workflow | T32.5 |
| Course operational amend | Direct `updateDoc` | Missing | No | HIGH | Intent-specific commands | T32.5 |
| Catalog content edit | Mixed legacy Course payload | Missing dedicated command | No | LOW | Isolate `course_catalog_content` | T32.5 |
| Course roster assignment | Legacy `instructorIds` | Missing | No | HIGH | Add/remove roster commands | T32.5 |
| CourseDay create/reassign | Legacy date/instructor fields | Exists | No | HIGH | UI and Admin projection | T32.5 |
| CourseDay reschedule/remove | Legacy date edits | Missing | No | HIGH | Commands and policy | T32.5 |
| Enrollment roster/detail | Legacy course-shaped bookings | Domain exists | No | HIGH | Admin roster scope | T32.6 |
| Enrollment cancellation | Legacy booking actions | Exists | No | CRITICAL | Canonical resolve/refund UX | T32.6 |
| Enrollment transfer | None | Handler exists | No | HIGH | Admin callable routing | T32.6 |
| Guest enrollment pending-payment confirmation/link | Legacy/none | Payment-funded `confirm_guest_course_enrollment` (T32.8C PASS); Admin `existing_managed` link (T32.8B PASS) | Partial | HIGH | Unpaid Admin approval is not policy; leftover unreachable UI is T32.9B after T32.9A parity | T32.6 / T32.8B / T32.8C |
| Attendance correction | Instructor UI only | Exists | No | HIGH | Admin correction workflow | T32.7 |
| Participant/account Admin | Direct `users` CRUD | Mostly exists | No | HIGH | Admin topology/diagnostics | T32.8 |
| Management assignment/revoke | None | Exists | No | HIGH | Admin UI/read model | T32.8 |
| Instructor catalog CRUD | Direct `instructors` CRUD | Missing | No | HIGH | Separate catalog commands/read model | T32.8 |
| Resort/settings content | Direct configuration writes | Not a canonical business domain | Not required | LOW | Keep isolated; leftover write cleanup is T32.9B after parity | T32.9B |

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
identify legacy implementations safe for later removal.

T32.9A is **not** broad legacy UI cleanup. Specific Admin capability inventories
belong here, not in the global [ADR-0008](adr/0008-ux-preservation-during-canonical-migration.md)
rule.

Scope:

- restore useful historical Admin screens, information density, planner,
  finance, People, monitoring, filtering, and operational workflows on
  canonical read models and commands;
- add new canonical UX where required (AdminIssue actions, Payment detail,
  Account / Participant topology);
- prove information, action, and interaction parity before any leftover
  implementation is treated as removable;
- record a UX parity inventory (`PASS` / `PARTIAL` / `MISSING` /
  `NEEDS_PRODUCT_DECISION`).

Reason:

- Admin migration must preserve product capability while replacing legacy
  authority. A canonical backend without the previous useful Admin UX is not
  a finished Admin slice.

### T32.9B — Final Legacy Write / Runtime Cleanup

T32.9B may remove a leftover implementation only after its useful product
capability has a canonical replacement **and** UX parity is proven. It must not
become a product-feature deletion phase.

Scope:

- remove Admin dependencies on legacy booking, Course, profile, instructor, and
  wallet wrappers that T32.9A has replaced with proven-parity canonical paths;
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

