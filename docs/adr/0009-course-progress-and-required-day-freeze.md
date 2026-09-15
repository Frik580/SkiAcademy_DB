# ADR-0009: Course progress semantics and required CourseDay freeze

## Status

Accepted — 2026-09-14 (T32.9A.9C.A); 9C.B recorded 2026-09-14; 9C.C READY_FOR_9C.D recorded 2026-09-14; 9C.D READY_FOR_9C.E recorded 2026-09-14; 9C.E / T32.9A.9C PASS / CLOSED recorded 2026-09-14

## Decision

Course Progress is curriculum/schedule progress, derived per `CourseEnrollment.participantId`:

```text
scheduledDays = verified current CourseDay count
elapsedDays = CourseDays where now >= endsAt
progressPercent = scheduledDays > 0 ? elapsedDays / scheduledDays * 100 : 0
```

Attendance remains separate factual evidence:

```text
recordedDays = presentDays + absentDays
missingDays = scheduledDays - recordedDays
attendanceCoveragePercent = recordedDays / scheduledDays * 100
attendanceRatePercent = recordedDays > 0 ? presentDays / recordedDays * 100 : null
```

All ratios are bounded to `0..100`. A running CourseDay is not elapsed until its canonical
`endsAt` instant. Client locale does not alter the comparison. Only Attendance for the current
CourseDay occurrence and the same Enrollment/Participant is counted.

Course completion remains the existing `CourseEnrollment.lifecycle` authority. After the final
CourseDay, any current `Attendance.present` resolves to `completed`; all current records absent
resolves to `no_show`; otherwise the Enrollment remains `confirmed` and `missing_attendance` is
opened/reused. `progressPercent = 100` is not completion evidence.

`course_graduate` is participant-scoped and server-issued exactly once from the
`CourseEnrollment.lifecycle -> completed` transition. Its `earnedAt` is `lifecycle.completedAt`
and its source is `course_completion`. Synthetic Booking, Activity Log, progress percentage, and
legacy data are never evidence. T32.9A.9C.D issues the badge in the same transaction as that
canonical completed transition; there is no historical backfill.

Every current CourseDay is required. On creation of the first canonical CourseEnrollment, the
Course's required CourseDay set is frozen. `create_course_day` rejects later additions. Before the
first Enrollment, existing CourseDay administration rules apply. Optional/supplemental days would
require a future explicit capability and semantics; they are not inferred.

## Scheduler boundary

Course outcome discovery must use participant/enrollment-scoped bounded work keyed by Enrollment
with `dueAt = finalCourseDayEndsAt + 24h` (the accepted Instructor Attendance deadline). A due work
item invokes the existing `resolve_attendance_outcome` command, which rechecks lifecycle, schedule,
current-occurrence Attendance, payment/Admin Issue gates, and idempotency transactionally. The
sweep must query due work in bounded, ordered pages; it must never scan all CourseEnrollments.
9C.B implements work storage, Enrollment-write synchronization, the bounded five-minute sweep,
the cursor/index, and the request-time read-model projection. 9C.B is complete. 9C.C consumes
that projection on Student Home / My Courses / Calendar / enrolled Course detail with selected
Participant isolation. 9C.D issues `course_graduate` on the canonical completed transition.
9C.E contains leftover Course legacy reachability (`enrollInCourse` unexported/removed) and
closes T32.9A.9C. **T32.9A.9C is PASS / CLOSED**; that closure was a source/containment closure that
deployed nothing on its own, and the production deployment of the CourseEnrollment read surface is
subsequently evidenced by the Admin Lessons + Courses consolidation cutover and its authenticated
production smoke on `queryAdminCourseEnrollmentReadModels` (see [T32_CANONICAL_ADMIN_AUDIT.md](../T32_CANONICAL_ADMIN_AUDIT.md)).

## Consequences

- `CourseProgressPresentation` is derived and is not a new aggregate.
- Account identity is never Course Progress identity; Participants on one Account remain isolated.
- Attendance coverage is operational data and must not be labeled Course Progress.
- Course schedule extension after sales is fail-closed without adding a snapshot aggregate.
- Account Enrollment reads use physical Firestore cursor pagination (`startAfter` on
  `updatedAt.seconds DESC`, `updatedAt.nanoseconds DESC`, `enrollmentId ASC`); no full drain.
