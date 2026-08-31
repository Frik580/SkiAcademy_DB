import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_DEFAULT,
  ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_MAX,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendanceIdFromCourseDayIdentity,
  canonicalPaths,
  compareCanonicalTimestamps,
  courseDayAttendanceMatchesCurrentOccurrence,
  courseEnrollmentReconciliationHasMutations,
  courseScheduleIsComplete,
  decodeAdminCourseEnrollmentCursor,
  encodeAdminCourseEnrollmentCursor,
  evaluateCourseEnrollmentReconciliation,
  isActiveCourseEnrollmentLifecycle,
  isCourseEnrollmentAllowedBeforeStart,
  isTerminalCourseEnrollmentLifecycle,
  evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability,
  refundableRetainedAmount,
  resolveCourseEnrollmentRefundDestination,
  sortedCourseDays,
  timestampFromDate,
  type Attendance,
  type AdminCourseEnrollmentDetailReadModel,
  type AdminCourseEnrollmentRosterItem,
  type AdminIssue,
  type Course,
  type CourseDay,
  type CourseDayId,
  type CourseEnrollment,
  type QueryAdminCourseEnrollmentReadModelsInput,
  type QueryAdminCourseEnrollmentReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import { parseAdminIssue } from '../adminIssues/adminIssueStore';
import { parsePayment } from '../finance/financeStore';
import { parseAccount, parseParticipant } from '../participantAccess/participantAccessStore';
import { parseCourse } from '../courses/courseStore';
import { courseDaysCollectionPath, parseCourseDays } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { attendancePath, parseAttendance } from '../bookings/attendanceStore';

type AdminCourseEnrollmentActions = AdminCourseEnrollmentRosterItem['authorizedActions'];
type AdminCourseEnrollmentIssueSummary = AdminCourseEnrollmentRosterItem['relatedIssues'][number];

const ACTIVE_STATUSES = ['pending', 'confirmed', 'pending_cancellation'] as const;
const TERMINAL_STATUSES = ['cancelled', 'withdrawn', 'completed', 'no_show'] as const;
const RECONCILIATION_ISSUE_KINDS = new Set<AdminIssue['kind']>([
  'payment_required_at_start',
  'attendance_payment_conflict',
  'missing_attendance',
  'resource_reconciliation_mismatch',
]);

export class InvalidAdminCourseEnrollmentCursorError extends Error {
  constructor() {
    super('Invalid Admin CourseEnrollment cursor');
    this.name = 'InvalidAdminCourseEnrollmentCursorError';
  }
}

function safeDisplayName(data: Record<string, unknown> | undefined, fallback: string): string {
  const displayName = data?.displayName;
  if (typeof displayName === 'string' && displayName.trim()) return displayName.trim();
  const email = data?.email;
  if (typeof email === 'string' && email.trim()) return email.trim();
  return fallback;
}

function guestState(enrollment: CourseEnrollment): AdminCourseEnrollmentRosterItem['guestState'] {
  if (enrollment.attribution.bookingOrigin !== 'guest') return 'not_guest';
  return enrollment.guestAccountLink ? 'linked' : 'pending_unlinked';
}

function enrollmentSeatHeldByCapacity(enrollment: CourseEnrollment, course: Course): boolean {
  if (isActiveCourseEnrollmentLifecycle(enrollment)) return true;
  const lifecycle = enrollment.lifecycle;
  const terminalizedAt =
    lifecycle.status === 'cancelled'
      ? lifecycle.cancelledAt
      : lifecycle.status === 'withdrawn'
        ? lifecycle.withdrawnAt
        : lifecycle.status === 'completed'
          ? lifecycle.completedAt
          : lifecycle.status === 'no_show'
            ? lifecycle.noShowAt
            : undefined;
  return terminalizedAt ? compareCanonicalTimestamps(terminalizedAt, course.startAt) >= 0 : false;
}

function issueSummary(issue: AdminIssue): AdminCourseEnrollmentIssueSummary {
  return {
    issueId: issue.issueId,
    revision: issue.revision,
    kind: issue.kind,
    severity: issue.severity,
    lifecycleStatus: issue.lifecycle.status,
  };
}

function transferDecision(enrollment: CourseEnrollment, course: Course) {
  if (enrollment.lifecycle.status !== 'confirmed') {
    return { eligible: false as const, blockedReason: 'lifecycle' as const };
  }
  if ((enrollment.attendanceSummary?.recordedDayCount ?? 0) > 0) {
    return { eligible: false as const, blockedReason: 'attendance_recorded' as const };
  }
  if (compareCanonicalTimestamps(timestampFromDate(new Date()), course.startAt) >= 0) {
    return { eligible: false as const, blockedReason: 'course_started' as const };
  }
  return { eligible: true as const };
}

function authorizedActions(
  enrollment: CourseEnrollment,
  course: Course,
  canReconcile = false,
  administratorAccountActive = true
): {
  readonly actions: AdminCourseEnrollmentActions;
  readonly guestIdentityLinkUnavailableReason?: AdminCourseEnrollmentRosterItem['guestIdentityLinkUnavailableReason'];
} {
  const transfer = transferDecision(enrollment, course);
  const now = timestampFromDate(new Date());
  const linkAvailability = evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
    bookingOrigin: enrollment.attribution.bookingOrigin,
    guestAccountLink: enrollment.guestAccountLink,
    lifecycleStatus: enrollment.lifecycle.status,
    reservationExpiresAt:
      enrollment.lifecycle.status === 'pending'
        ? enrollment.lifecycle.reservationExpiresAt
        : undefined,
    now,
    recordedDayCount: enrollment.attendanceSummary?.recordedDayCount ?? 0,
    courseStartAt: course.startAt,
    administratorAccountActive,
  });
  return {
    actions: {
      canResolveCancellation: enrollment.lifecycle.status === 'pending_cancellation',
      canTransfer: transfer.eligible,
      canReconcile,
      canResolveAttendanceOutcome:
        enrollment.lifecycle.status === 'confirmed' &&
        compareCanonicalTimestamps(
          timestampFromDate(new Date()),
          course.scheduleProjection.finalCourseDayEndsAt
        ) >= 0,
      canApproveGuest: false,
      canLinkGuest: linkAvailability.canLink,
      canWithdraw: false,
    },
    guestIdentityLinkUnavailableReason: linkAvailability.reason,
  };
}

function attendanceDayProjection(input: {
  readonly enrollment: CourseEnrollment;
  readonly courseDays: readonly CourseDay[];
  readonly attendances: ReadonlyMap<CourseDayId, Attendance>;
  readonly now: ReturnType<typeof timestampFromDate>;
}): AdminCourseEnrollmentDetailReadModel['attendanceDays'] {
  const nonterminal =
    input.enrollment.lifecycle.status === 'confirmed' ||
    input.enrollment.lifecycle.status === 'pending_cancellation';
  return input.courseDays.map((courseDay) => {
    const attendance = input.attendances.get(courseDay.courseDayId);
    const started = compareCanonicalTimestamps(input.now, courseDay.interval.startsAt) >= 0;
    const canRecordPresent =
      started &&
      ((nonterminal && attendance?.attendanceStatus !== 'present') ||
        (input.enrollment.lifecycle.status === 'no_show' &&
          attendance?.attendanceStatus === 'absent'));
    const canRecordAbsent =
      started &&
      ((nonterminal && attendance?.attendanceStatus !== 'absent') ||
        (input.enrollment.lifecycle.status === 'completed' &&
          attendance?.attendanceStatus === 'present'));
    return {
      courseDayId: courseDay.courseDayId,
      startsAt: courseDay.interval.startsAt,
      endsAt: courseDay.interval.endsAt,
      instructorIds: [...courseDay.actualInstructorIds],
      ...(attendance
        ? {
            attendanceId: attendance.attendanceId,
            attendanceStatus: attendance.attendanceStatus,
            attendanceRevision: attendance.revision,
            recordedBy: attendance.recordedBy,
            recordedAt: attendance.recordedAt,
            lastChangedBy: attendance.lastChangedBy,
            updatedAt: attendance.updatedAt,
          }
        : {}),
      authorizedActions: { canRecordPresent, canRecordAbsent, reasonRequired: true as const },
    };
  });
}

async function loadCourseDays(firestore: Firestore, courseId: Course['courseId']) {
  const snapshot = await firestore.collection(courseDaysCollectionPath(courseId)).get();
  return sortedCourseDays(
    parseCourseDays(
      snapshot.docs.map((document) => ({
        data: document.data() as Record<string, unknown>,
      }))
    )
  );
}

async function loadAttendances(
  firestore: Firestore,
  enrollment: CourseEnrollment,
  courseDays: readonly CourseDay[]
): Promise<Map<CourseDayId, Attendance>> {
  const attendances = new Map<CourseDayId, Attendance>();
  await Promise.all(
    courseDays.map(async (courseDay) => {
      const attendanceId = attendanceIdFromCourseDayIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'course_enrollment',
        enrollmentId: enrollment.enrollmentId,
        courseDayId: courseDay.courseDayId,
      });
      const snapshot = await firestore.doc(attendancePath(attendanceId)).get();
      const attendance = parseAttendance(snapshot.data() as Record<string, unknown> | undefined);
      if (attendance && courseDayAttendanceMatchesCurrentOccurrence(attendance, courseDay)) {
        attendances.set(courseDay.courseDayId, attendance);
      }
    })
  );
  return attendances;
}

async function reconciliationProjection(input: {
  readonly firestore: Firestore;
  readonly enrollment: CourseEnrollment;
  readonly course: Course;
  readonly payment: NonNullable<ReturnType<typeof parsePayment>> | undefined;
  readonly issues: readonly AdminIssue[];
}): Promise<AdminCourseEnrollmentDetailReadModel['reconciliation']> {
  const evidenceIssueIds = input.issues
    .filter(
      (issue) => issue.lifecycle.status === 'open' && RECONCILIATION_ISSUE_KINDS.has(issue.kind)
    )
    .map((issue) => issue.issueId);
  if (!input.payment || input.enrollment.lifecycle.status === 'pending_cancellation') {
    return { eligible: false, evidenceIssueIds };
  }
  const courseDays = await loadCourseDays(input.firestore, input.course.courseId);
  if (!courseScheduleIsComplete(input.course, courseDays)) {
    return { eligible: false, evidenceIssueIds };
  }
  const attendancesByCourseDayId = await loadAttendances(
    input.firestore,
    input.enrollment,
    courseDays
  );
  const guardPath = canonicalPaths
    .activeCourseEnrollmentGuard(input.enrollment.participantId, input.enrollment.courseId)
    .replace(/^\//, '');
  const guard = await input.firestore.doc(guardPath).get();
  const terminalEnrollmentHasActiveResourceGuard =
    isTerminalCourseEnrollmentLifecycle(input.enrollment) &&
    guard.exists &&
    (guard.data() as { courseEnrollmentId?: unknown } | undefined)?.courseEnrollmentId ===
      input.enrollment.enrollmentId;
  const decision = evaluateCourseEnrollmentReconciliation({
    now: timestampFromDate(new Date()),
    enrollment: input.enrollment,
    course: input.course,
    courseDays,
    payment: input.payment,
    attendancesByCourseDayId,
    openAdminIssues: input.issues.filter((issue) => issue.lifecycle.status === 'open'),
    automationOnly: false,
    terminalEnrollmentHasActiveResourceGuard,
  });
  return {
    eligible:
      evidenceIssueIds.length > 0 && courseEnrollmentReconciliationHasMutations({ decision }),
    evidenceIssueIds,
  };
}

async function transferTargetOptions(input: {
  readonly firestore: Firestore;
  readonly enrollment: CourseEnrollment;
  readonly sourceCourse: Course;
}) {
  const now = timestampFromDate(new Date());
  const sourceDays = await loadCourseDays(input.firestore, input.sourceCourse.courseId);
  if (
    !transferDecision(input.enrollment, input.sourceCourse).eligible ||
    !courseScheduleIsComplete(input.sourceCourse, sourceDays)
  ) {
    return [];
  }
  const snapshot = await input.firestore.collection('courses').limit(100).get();
  const candidates = await Promise.all(
    snapshot.docs.map(async (document) => {
      const course = parseCourse(document.data() as Record<string, unknown>);
      if (
        !course ||
        course.courseId === input.sourceCourse.courseId ||
        course.lifecycle !== 'active' ||
        course.capacity.availableSeats < 1 ||
        !isCourseEnrollmentAllowedBeforeStart({ now, courseStartsAt: course.startAt })
      ) {
        return undefined;
      }
      const courseDays = await loadCourseDays(input.firestore, course.courseId);
      if (!courseScheduleIsComplete(course, courseDays)) return undefined;
      return {
        courseId: course.courseId,
        title: course.title,
        revision: course.revision,
        availableSeats: course.capacity.availableSeats,
        price: course.price,
      };
    })
  );
  return candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .sort((left, right) => left.title.localeCompare(right.title));
}

async function loadRelatedIssues(
  firestore: Firestore,
  enrollment: CourseEnrollment
): Promise<AdminIssue[]> {
  const snapshot = await firestore
    .collection('admin_issues')
    .where('subjectRef.enrollmentId', '==', enrollment.enrollmentId)
    .get();
  return snapshot.docs.flatMap((document) => {
    const issue = parseAdminIssue(document.data() as Record<string, unknown>);
    return issue ? [issue] : [];
  });
}

async function buildAdminCourseEnrollmentItem(
  firestore: Firestore,
  enrollment: CourseEnrollment,
  includeOperationalDetail = false,
  administratorAccountActive = true
): Promise<
  | {
      readonly item: AdminCourseEnrollmentRosterItem;
      readonly detail: AdminCourseEnrollmentDetailReadModel;
    }
  | undefined
> {
  const [courseSnapshot, participantSnapshot, paymentSnapshot, issues] = await Promise.all([
    firestore.collection('courses').doc(enrollment.courseId).get(),
    firestore.collection('participants').doc(enrollment.participantId).get(),
    firestore.collection('payments').doc(enrollment.paymentId).get(),
    loadRelatedIssues(firestore, enrollment),
  ]);
  const course = parseCourse(courseSnapshot.data() as Record<string, unknown> | undefined);
  const participant = parseParticipant(
    participantSnapshot.data() as Record<string, unknown> | undefined
  );
  const payment = parsePayment(paymentSnapshot.data() as Record<string, unknown> | undefined);
  if (!course || !participant) return undefined;

  const payerAccountId = enrollment.payerAccountId ?? payment?.payerAccountId;
  const payerSnapshot = payerAccountId
    ? await firestore.collection('users').doc(payerAccountId).get()
    : undefined;
  const payerData = payerSnapshot?.data() as Record<string, unknown> | undefined;
  const transfer = transferDecision(enrollment, course);
  const [reconciliation, targetOptions, attendanceDays] = includeOperationalDetail
    ? await Promise.all([
        reconciliationProjection({ firestore, enrollment, course, payment, issues }),
        transferTargetOptions({ firestore, enrollment, sourceCourse: course }),
        loadCourseDays(firestore, course.courseId).then(async (courseDays) =>
          attendanceDayProjection({
            enrollment,
            courseDays,
            attendances: await loadAttendances(firestore, enrollment, courseDays),
            now: timestampFromDate(new Date()),
          })
        ),
      ])
    : [{ eligible: false, evidenceIssueIds: [] }, [], []];
  const actions = authorizedActions(
    enrollment,
    course,
    reconciliation.eligible,
    administratorAccountActive
  );

  const item: AdminCourseEnrollmentRosterItem = {
    enrollmentId: enrollment.enrollmentId,
    revision: enrollment.revision,
    course: {
      courseId: course.courseId,
      title: course.title,
      lifecycle: course.lifecycle,
      revision: course.revision,
    },
    participant: {
      participantId: participant.participantId,
      displayName: participant.displayName,
    },
    ...(payerAccountId
      ? {
          payer: {
            accountId: payerAccountId,
            displayName: safeDisplayName(payerData, payerAccountId),
          },
        }
      : {}),
    lifecycleStatus: enrollment.lifecycle.status,
    guestState: guestState(enrollment),
    ...(payment
      ? {
          payment: {
            paymentId: payment.paymentId,
            status: payment.paymentStatus,
            revision: payment.revision,
            price: payment.price,
            paid: payment.paidAmount,
            refunded: payment.refundedAmount,
            retained: payment.retainedAmount,
            settled: payment.settledAmount,
            writtenOff: payment.writtenOffAmount,
            outstanding: payment.outstandingAmount,
          },
        }
      : {}),
    ...(enrollment.attendanceSummary ? { attendanceSummary: enrollment.attendanceSummary } : {}),
    relatedIssues: issues.map(issueSummary),
    authorizedActions: actions.actions,
    ...(actions.guestIdentityLinkUnavailableReason
      ? { guestIdentityLinkUnavailableReason: actions.guestIdentityLinkUnavailableReason }
      : {}),
    updatedAt: enrollment.updatedAt,
  };

  const detail: AdminCourseEnrollmentDetailReadModel = {
    ...item,
    originalCourseId: enrollment.originalCourseId,
    paymentId: enrollment.paymentId,
    ...(payerAccountId ? { payerAccountId } : {}),
    capacity: {
      totalSeats: course.capacity.totalSeats,
      availableSeats: course.capacity.availableSeats,
      seatHeldByEnrollment: enrollmentSeatHeldByCapacity(enrollment, course),
    },
    ...(payment
      ? {
          cancellation: {
            ...(enrollment.lifecycle.status === 'pending_cancellation'
              ? { requestedAt: enrollment.lifecycle.requestedAt }
              : {}),
            maximumRefund: refundableRetainedAmount(payment),
            refundDestination: resolveCourseEnrollmentRefundDestination(payment),
          },
        }
      : {}),
    transfer: { ...transfer, targetOptions },
    reconciliation,
    attendanceDays,
    auditContext: {
      bookingOrigin: enrollment.attribution.bookingOrigin,
      createdAt: enrollment.createdAt,
      updatedAt: enrollment.updatedAt,
    },
  };
  return { item, detail };
}

function listQuery(
  firestore: Firestore,
  input: Extract<
    QueryAdminCourseEnrollmentReadModelsInput,
    { scope: 'admin_course_roster' | 'admin_pending_guest' | 'admin_history' }
  >
): Query {
  let query: Query = firestore.collection('course_enrollments');
  if (input.courseId) query = query.where('courseId', '==', input.courseId);
  if (input.scope === 'admin_course_roster') {
    query = query.where('lifecycle.status', 'in', ACTIVE_STATUSES);
  } else if (input.scope === 'admin_pending_guest') {
    query = query
      .where('attribution.bookingOrigin', '==', 'guest')
      .where('lifecycle.status', '==', 'pending');
  } else {
    query = query.where('lifecycle.status', 'in', TERMINAL_STATUSES);
  }
  query = query
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('enrollmentId', 'asc');

  const cursor = input.cursor ? decodeAdminCourseEnrollmentCursor(input.cursor) : undefined;
  if (
    input.cursor &&
    (!cursor || cursor.scope !== input.scope || cursor.courseId !== input.courseId)
  ) {
    throw new InvalidAdminCourseEnrollmentCursorError();
  }
  if (cursor) {
    query = query.startAfter(
      cursor.updatedAtSeconds,
      cursor.updatedAtNanoseconds,
      cursor.enrollmentId
    );
  }
  return query;
}

export async function queryAdminCourseEnrollmentReadModels(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  input: QueryAdminCourseEnrollmentReadModelsInput
): Promise<QueryAdminCourseEnrollmentReadModelsResult> {
  const administratorSnap = await firestore.collection('users').doc(actor.accountId).get();
  const administratorAccount = parseAccount(
    administratorSnap.data() as Record<string, unknown> | undefined
  );
  const administratorAccountActive = administratorAccount?.lifecycle.status === 'active';
  if (input.scope === 'admin_enrollment_detail') {
    const snapshot = await firestore.collection('course_enrollments').doc(input.enrollmentId).get();
    const enrollment = parseCourseEnrollment(
      snapshot.data() as Record<string, unknown> | undefined
    );
    if (!enrollment) return { scope: input.scope };
    const built = await buildAdminCourseEnrollmentItem(
      firestore,
      enrollment,
      true,
      administratorAccountActive
    );
    return { scope: input.scope, ...(built ? { item: built.detail } : {}) };
  }

  const pageSize = Math.min(
    input.pageSize ?? ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_DEFAULT,
    ADMIN_COURSE_ENROLLMENT_PAGE_SIZE_MAX
  );
  const snapshot = await listQuery(firestore, input)
    .limit(pageSize + 1)
    .get();
  const enrollments = snapshot.docs.flatMap((document) => {
    const enrollment = parseCourseEnrollment(document.data() as Record<string, unknown>);
    return enrollment ? [enrollment] : [];
  });
  const page = enrollments.slice(0, pageSize);
  const built = await Promise.all(
    page.map((enrollment) =>
      buildAdminCourseEnrollmentItem(firestore, enrollment, false, administratorAccountActive)
    )
  );
  const items = built.flatMap((value) => (value ? [value.item] : []));
  const hasMore = enrollments.length > pageSize;
  const last = page[page.length - 1];
  return {
    scope: input.scope,
    items,
    hasMore,
    ...(hasMore && last
      ? {
          nextCursor: encodeAdminCourseEnrollmentCursor({
            scope: input.scope,
            ...(input.courseId ? { courseId: input.courseId } : {}),
            updatedAtSeconds: last.updatedAt.seconds,
            updatedAtNanoseconds: last.updatedAt.nanoseconds,
            enrollmentId: last.enrollmentId,
          }),
        }
      : {}),
  };
}
