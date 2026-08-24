# Course, enrollment, attendance, and AdminIssue decisions

T04 adds strict canonical contracts for Course delivery, CourseDay schedules,
CourseEnrollment, factual Attendance, derived attendance summaries, and typed
AdminIssue records.

- `Course` owns product configuration, admission capacity, instructor roster,
  `startAt`, and rebuildable schedule projections (`courseDayCount`,
  `finalCourseDayEndsAt`, `courseScheduleRevision`). Free-form legacy schedule
  fields and whole-Course cancellation fields are rejected.
- `CourseDay` records are authoritative structured delivery intervals at
  `/courses/{courseId}/days/{courseDayId}` with half-open `startsAt`/`endsAt`,
  IANA timezone, ordering, and actual Instructor assignments. Synthetic
  `course_*` Instructor IDs are rejected.
- `CourseEnrollment` is a first-class aggregate distinct from `Booking`. One
  Participant equals one enrollment equals one seat. `enrollmentId` is opaque,
  immutable, and never derived from `participantId + courseId`. Pre-start
  transfer may preserve `enrollmentId` while `courseId` changes; immutable
  `originalCourseId` preserves transfer history.
- Active participant+course uniqueness uses the deterministic
  `activeCourseEnrollmentGuardKey` from T01; the guard is not enrollment
  identity.
- `Attendance` is factual evidence with only `present` or `absent`. Missing
  documents mean unknown; explicit `unknown` status is forbidden. Booking
  Attendance identity is `attendance:v1:booking:{occurrenceId}:{participantId}`;
  CourseDay Attendance identity is
  `attendance:v1:course-day:{enrollmentId}:{courseDayId}`.
- `CourseEnrollment.attendanceSummary` is a rebuildable transactional projection
  and is not source of truth. Canonical Attendance documents remain authoritative.
- `AdminIssue` is operational state separate from Attendance, lifecycle,
  Payment, and Activity Log. Lifecycle is `open`, `resolved`, or `dismissed`.
  Initial kinds include `missing_attendance`, `payment_required_at_start`,
  `unresolved_pending_cancellation`, `attendance_payment_conflict`,
  `resource_reconciliation_mismatch`, `financial_reconciliation_mismatch`, and
  `outcome_correction_required`. `issueId` is derived from a versioned
  `dedupeKey`.

This slice contains no enrollment commands, capacity mutation, transfer
execution, attendance recording commands, outcome calculation, AdminIssue
resolution commands, payment-start gates, Firestore transactions, schedulers,
frontend behavior, Rules/index changes, migration, or legacy compatibility.
