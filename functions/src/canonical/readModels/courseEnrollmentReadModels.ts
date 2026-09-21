import {
  compareCanonicalTimestamps,
  deriveCourseProgressPresentation,
  evaluateCourseEnrollmentAuthorizedActions,
  evaluateInstructorCourseEnrollmentRosterAuthorizedActions,
  evaluateInstructorCourseRosterReadAccess,
  evaluateParticipantManagementAccess,
  isCourseEnrollmentHot,
  isInstructorActiveRosterEnrollment,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
  guestSubjectIdFromCourseEnrollmentId,
  type Account,
  type AccountId,
  type Attendance,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CourseEnrollmentReadModel,
  type CourseEnrollmentReadModelCursor,
  type CourseEnrollmentReadModelLifecycleProjection,
  type CourseEnrollmentReadModelPaymentPresentation,
  type CourseEnrollmentProgressProjection,
  type InstructorCourseEnrollmentRosterItem,
  type InstructorId,
  type Participant,
  type ParticipantManagement,
  type Payment,
  type QueryCourseEnrollmentReadModelsInput,
  type QueryCourseEnrollmentReadModelsResult,
  decodeCourseEnrollmentReadModelCursor,
  encodeCourseEnrollmentReadModelCursor,
  drainInstructorRosterCompleteSet,
  COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_DEFAULT,
  COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX,
  LIVE_CANONICAL_READ_SCOPE,
  type CanonicalReadScope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { parseAttendance } from '../bookings/attendanceStore';
import { parseAccount, parsePayment } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantManagement,
} from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { parseCourse, parseCourseDays } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';
import { loadLessonBookingReadAuthorizationContext } from './lessonBookingReadModels';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';
import {
  createReadModelRequestContext,
  type ReadModelRequestContext,
} from './readModelRequestContext';
import { parseIfVisibleInReadScope } from './readModelScope';

export interface CourseEnrollmentReadAuthorizationContext {
  readonly account?: Account;
  readonly participantManagement: readonly ParticipantManagement[];
  readonly participants: readonly Participant[];
}

export class InvalidCourseEnrollmentReadCursorError extends Error {
  constructor() {
    super('The CourseEnrollment cursor is invalid for this query.');
    this.name = 'InvalidCourseEnrollmentReadCursorError';
  }
}

export async function loadCourseEnrollmentReadAuthorizationContext(
  firestore: Firestore,
  accountId: AccountId,
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore)
): Promise<CourseEnrollmentReadAuthorizationContext> {
  return loadLessonBookingReadAuthorizationContext(firestore, accountId, readContext);
}

async function loadSelectedCourseEnrollmentReadAuthorizationContext(
  accountId: AccountId,
  participantId: Participant['participantId'],
  readContext: ReadModelRequestContext
): Promise<CourseEnrollmentReadAuthorizationContext> {
  const [accountSnapshot, participantSnapshot] = await Promise.all([
    readContext.account(accountId),
    readContext.participant(participantId),
  ]);
  const account = parseAccount(accountSnapshot.data() as Record<string, unknown> | undefined);
  const participant = parseParticipant(
    participantSnapshot.data() as Record<string, unknown> | undefined
  );
  if (!participant || participant.management.kind !== 'managed') {
    return { account, participantManagement: [], participants: participant ? [participant] : [] };
  }
  const managementSnapshot = await readContext.participantManagement(
    participant.management.participantManagementId
  );
  const management = parseParticipantManagement(
    managementSnapshot.data() as Record<string, unknown> | undefined
  );
  return {
    account,
    participantManagement: management ? [management] : [],
    participants: [participant],
  };
}

function buildLifecycleProjection(
  enrollment: CourseEnrollment
): CourseEnrollmentReadModelLifecycleProjection {
  const lifecycle = enrollment.lifecycle;
  if (lifecycle.status === 'pending') {
    return { status: lifecycle.status, reservationExpiresAt: lifecycle.reservationExpiresAt };
  }
  if (lifecycle.status === 'pending_cancellation') {
    return { status: lifecycle.status, requestedAt: lifecycle.requestedAt };
  }
  if (lifecycle.status === 'cancelled') {
    return {
      status: lifecycle.status,
      cancelledAt: lifecycle.cancelledAt,
      reasonCode: lifecycle.reasonCode,
    };
  }
  if (lifecycle.status === 'withdrawn') {
    return { status: lifecycle.status, withdrawnAt: lifecycle.withdrawnAt };
  }
  if (lifecycle.status === 'completed') {
    return { status: lifecycle.status, completedAt: lifecycle.completedAt };
  }
  if (lifecycle.status === 'no_show') {
    return { status: lifecycle.status, noShowAt: lifecycle.noShowAt };
  }
  return { status: lifecycle.status };
}

function canAccountViewEnrollmentFinancial(
  accountId: AccountId,
  enrollment: CourseEnrollment,
  payment: Payment | undefined
): boolean {
  const payerAccountId = enrollment.payerAccountId ?? payment?.payerAccountId;
  return payerAccountId !== undefined && payerAccountId === accountId;
}

function buildPaymentPresentation(
  accountId: AccountId,
  enrollment: CourseEnrollment,
  payment: Payment | undefined
): CourseEnrollmentReadModelPaymentPresentation | undefined {
  if (!payment) {
    return undefined;
  }
  if (!canAccountViewEnrollmentFinancial(accountId, enrollment, payment)) {
    return { kind: 'withheld' };
  }
  return {
    kind: 'visible',
    paymentStatus: payment.paymentStatus,
    paymentRevision: payment.revision,
    price: payment.price,
  };
}

function canAccountViewEnrollment(
  context: CourseEnrollmentReadAuthorizationContext,
  accountId: AccountId,
  enrollment: CourseEnrollment
): boolean {
  if (!context.account || context.account.accountId !== accountId) {
    return false;
  }
  const management = context.participantManagement.find(
    (record) => record.participantId === enrollment.participantId
  );
  const participant = context.participants.find(
    (record) => record.participantId === enrollment.participantId
  );
  if (!management || !participant) {
    return false;
  }
  const topology = buildParticipantAccessTopology({
    account: context.account,
    participant,
    management,
  });
  const decision = evaluateParticipantManagementAccess(topology, {
    accountId,
    participantId: enrollment.participantId,
  });
  return decision.allowed;
}

function canAccountManageParticipant(
  context: CourseEnrollmentReadAuthorizationContext,
  accountId: AccountId,
  participantId: Participant['participantId']
): boolean {
  if (!context.account || context.account.accountId !== accountId) return false;
  const management = context.participantManagement.find(
    (record) => record.participantId === participantId
  );
  const participant = context.participants.find((record) => record.participantId === participantId);
  if (!management || !participant) return false;
  return evaluateParticipantManagementAccess(
    buildParticipantAccessTopology({ account: context.account, participant, management }),
    { accountId, participantId }
  ).allowed;
}

function courseProgressProjection(
  presentation: ReturnType<typeof deriveCourseProgressPresentation>
): CourseEnrollmentProgressProjection {
  return {
    scheduledDays: presentation.scheduledDays,
    elapsedDays: presentation.elapsedDays,
    recordedDays: presentation.recordedDays,
    presentDays: presentation.presentDays,
    absentDays: presentation.absentDays,
    missingDays: presentation.missingDays,
    progressPercent: presentation.progressPercent,
    attendanceCoveragePercent: presentation.attendanceCoveragePercent,
    attendanceRatePercent: presentation.attendanceRatePercent,
  };
}

async function loadCourseDays(
  firestore: Firestore,
  courseId: Course['courseId'],
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore)
): Promise<CourseDay[]> {
  const snapshot = await readContext.courseDays(courseId);
  return parseCourseDays(
    snapshot.docs.map((doc) => ({ data: doc.data() as Record<string, unknown> }))
  );
}

export async function buildCourseEnrollmentReadModel(
  firestore: Firestore,
  accountId: AccountId,
  enrollment: CourseEnrollment,
  options: {
    readonly authContext?: CourseEnrollmentReadAuthorizationContext;
    readonly now?: ReturnType<typeof timestampFromDate>;
    readonly includePayment?: boolean;
    readonly includeAttendanceSummary?: boolean;
    readonly courseContext?: { readonly course: Course; readonly courseDays: readonly CourseDay[] };
    readonly attendancesByCourseDayId?: ReadonlyMap<CourseDay['courseDayId'], Attendance>;
    readonly readContext?: ReadModelRequestContext;
  } = {}
): Promise<CourseEnrollmentReadModel | undefined> {
  const readContext = options.readContext ?? createReadModelRequestContext(firestore);
  const authContext =
    options.authContext ??
    (await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId, readContext));
  const now = options.now ?? timestampFromDate(new Date());

  if (!canAccountViewEnrollment(authContext, accountId, enrollment)) {
    return undefined;
  }

  const course =
    options.courseContext?.course ??
    parseCourse(
      (await readContext.course(enrollment.courseId)).data() as Record<string, unknown> | undefined
    );
  if (!course) return undefined;
  const courseDays =
    options.courseContext?.courseDays ??
    (await loadCourseDays(firestore, enrollment.courseId, readContext));
  const participantSnap = await readContext.participant(enrollment.participantId);
  const participant = parseParticipant(
    participantSnap.data() as Record<string, unknown> | undefined
  );
  if (!participant) {
    return undefined;
  }

  const management = authContext.participantManagement.find(
    (record) => record.participantId === enrollment.participantId
  );
  const topology = buildParticipantAccessTopology({
    account: authContext.account!,
    participant,
    management: management!,
  });

  const authorizedActions = management
    ? evaluateCourseEnrollmentAuthorizedActions({
        actor: {
          kind: 'account_manager',
          accountId,
          participantManagementId: management.participantManagementId,
          authority: management.authority,
        },
        account: authContext.account,
        participant,
        management,
        enrollment,
        course,
        topology,
        now,
      })
    : { canWithdraw: false, canRequestCancellation: false };

  const paymentSnapshot =
    options.includePayment === false
      ? undefined
      : await readContext.payment(paymentIdFromCourseEnrollmentId(enrollment.enrollmentId));
  const payment = paymentSnapshot
    ? parsePayment(paymentSnapshot.data() as Record<string, unknown> | undefined)
    : undefined;
  const effectiveAttendances =
    options.attendancesByCourseDayId ??
    groupEnrollmentAttendances(
      await readContext.enrollmentAttendances(enrollment.enrollmentId)
    ).get(enrollment.enrollmentId) ??
    new Map();
  const progress = deriveCourseProgressPresentation({
    now,
    enrollment,
    course,
    courseDays,
    attendancesByCourseDayId: effectiveAttendances,
  });

  return {
    enrollmentId: enrollment.enrollmentId,
    revision: enrollment.revision,
    courseId: enrollment.courseId,
    ...(enrollment.originalCourseId !== enrollment.courseId
      ? { originalCourseId: enrollment.originalCourseId }
      : {}),
    participant: {
      participantId: participant.participantId,
      displayName: participant.displayName,
    },
    lifecycle: buildLifecycleProjection(enrollment),
    courseDisplay: {
      courseId: course.courseId,
      title: course.title,
    },
    courseSchedule: buildCourseScheduleProjectionReadModel(course, courseDays),
    bookingOrigin: enrollment.attribution.bookingOrigin,
    authorizedActions,
    ...(options.includePayment !== false
      ? { paymentPresentation: buildPaymentPresentation(accountId, enrollment, payment) }
      : {}),
    ...(options.includeAttendanceSummary && enrollment.attendanceSummary
      ? { attendanceSummary: enrollment.attendanceSummary }
      : {}),
    courseProgress: courseProgressProjection(progress),
    updatedAt: enrollment.updatedAt,
  };
}

export function assertInstructorCourseRosterReadAccess(input: {
  readonly instructorId: InstructorId;
  readonly course: Course;
  readonly courseDays: readonly CourseDay[];
}): void {
  const access = evaluateInstructorCourseRosterReadAccess(input);
  if (!access.allowed) {
    throw new ReadModelAccessDeniedError();
  }
}

export async function buildInstructorCourseEnrollmentRosterItem(
  firestore: Firestore,
  instructorId: InstructorId,
  enrollment: CourseEnrollment,
  course: Course,
  courseDays: readonly CourseDay[],
  readContext: ReadModelRequestContext = createReadModelRequestContext(firestore)
): Promise<InstructorCourseEnrollmentRosterItem | undefined> {
  if (!isInstructorActiveRosterEnrollment(enrollment)) {
    return undefined;
  }

  const participantSnap = await readContext.participant(enrollment.participantId);
  const participant = parseParticipant(
    participantSnap.data() as Record<string, unknown> | undefined
  );
  if (!participant) {
    return undefined;
  }

  return {
    enrollmentId: enrollment.enrollmentId,
    revision: enrollment.revision,
    courseId: enrollment.courseId,
    participant: {
      participantId: participant.participantId,
      displayName: participant.displayName,
    },
    lifecycle: buildLifecycleProjection(enrollment),
    courseDisplay: {
      courseId: course.courseId,
      title: course.title,
    },
    courseSchedule: buildCourseScheduleProjectionReadModel(course, courseDays),
    authorizedActions: evaluateInstructorCourseEnrollmentRosterAuthorizedActions({
      instructorId,
      course,
      courseDays,
    }),
    updatedAt: enrollment.updatedAt,
  };
}

function compareEnrollmentReadOrder(left: CourseEnrollment, right: CourseEnrollment): number {
  const updatedCompare = compareCanonicalTimestamps(left.updatedAt, right.updatedAt);
  if (updatedCompare !== 0) {
    return -updatedCompare;
  }
  return left.enrollmentId.localeCompare(right.enrollmentId);
}

const INSTRUCTOR_ROSTER_ACTIVE_STATUSES = ['confirmed', 'pending_cancellation'] as const;

/**
 * One Firestore page of active instructor roster enrollments.
 * Cursor is applied via startAfter on the ordered query — page N does not re-scan page 1.
 */
export async function loadInstructorRosterEnrollmentPage(
  firestore: Firestore,
  courseId: Course['courseId'],
  options: {
    readonly pageSize: number;
    readonly cursor?: CourseEnrollmentReadModelCursor;
    readonly readScope?: CanonicalReadScope;
  }
): Promise<{ readonly enrollments: CourseEnrollment[]; readonly hasMore: boolean }> {
  let query = firestore
    .collection('course_enrollments')
    .where('courseId', '==', courseId)
    .where('lifecycle.status', 'in', [...INSTRUCTOR_ROSTER_ACTIVE_STATUSES])
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('enrollmentId', 'asc');

  if (options.cursor) {
    query = query.startAfter(
      options.cursor.updatedAtSeconds,
      options.cursor.updatedAtNanoseconds,
      options.cursor.enrollmentId
    );
  }

  const snapshot = await query.limit(options.pageSize + 1).get();
  const enrollments: CourseEnrollment[] = [];
  const readScope = options.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  for (const doc of snapshot.docs) {
    const parsed = parseIfVisibleInReadScope(doc.data(), parseCourseEnrollment, readScope);
    if (parsed && isInstructorActiveRosterEnrollment(parsed)) {
      enrollments.push(parsed);
    }
  }
  const hasMore = enrollments.length > options.pageSize;
  return {
    enrollments: enrollments.slice(0, options.pageSize),
    hasMore,
  };
}

/**
 * OPERATIONAL_COMPLETE_SET for attendance joins.
 * Bound: active roster ≤ Course capacity ≤ COURSE_SEAT_MAX (64).
 * Uses cursor pages (no first-N rescan). Overflow fails visibly.
 */
export async function loadInstructorRosterEnrollments(
  firestore: Firestore,
  courseId: Course['courseId'],
  options: { readonly readScope?: CanonicalReadScope } = {}
): Promise<CourseEnrollment[]> {
  const pageSize = COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX;
  const items = await drainInstructorRosterCompleteSet({
    pageSize,
    fetchPage: async (encodedCursor) => {
      const cursor = encodedCursor
        ? decodeCourseEnrollmentReadModelCursor(encodedCursor)
        : undefined;
      if (encodedCursor && !cursor) {
        throw new Error('Invalid instructor roster cursor');
      }
      const result = await loadInstructorRosterEnrollmentPage(firestore, courseId, {
        pageSize,
        ...(cursor ? { cursor } : {}),
        readScope: options.readScope,
      });
      const last = result.enrollments[result.enrollments.length - 1];
      return {
        items: result.enrollments,
        hasMore: result.hasMore,
        ...(result.hasMore && last
          ? {
              nextCursor: encodeCourseEnrollmentReadModelCursor({
                updatedAtSeconds: last.updatedAt.seconds,
                updatedAtNanoseconds: last.updatedAt.nanoseconds,
                enrollmentId: last.enrollmentId,
              }),
            }
          : {}),
      };
    },
  });
  return [...items];
}

async function loadAuthorizedAccountEnrollmentPage(
  firestore: Firestore,
  accountId: AccountId,
  options: {
    readonly pageSize: number;
    readonly cursor?: CourseEnrollmentReadModelCursor;
    readonly selectedParticipantId?: Participant['participantId'];
    readonly authContext?: CourseEnrollmentReadAuthorizationContext;
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  }
): Promise<{ readonly enrollments: CourseEnrollment[]; readonly hasMore: boolean }> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });
  const authContext =
    options.authContext ??
    (await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId, readContext));
  if (
    options.selectedParticipantId &&
    !canAccountManageParticipant(authContext, accountId, options.selectedParticipantId)
  ) {
    throw new ReadModelAccessDeniedError();
  }
  const participantIds = options.selectedParticipantId
    ? [options.selectedParticipantId]
    : [
        ...new Set(
          authContext.participantManagement
            .map((management) => management.participantId)
            .filter((participantId) =>
              canAccountManageParticipant(authContext, accountId, participantId)
            )
        ),
      ];
  if (participantIds.length === 0) {
    return { enrollments: [], hasMore: false };
  }

  const enrollmentsById = new Map<string, CourseEnrollment>();
  const batchSize = 30;
  for (let index = 0; index < participantIds.length; index += batchSize) {
    const batch = participantIds.slice(index, index + batchSize);
    let query = firestore
      .collection('course_enrollments')
      .where(
        'participantId',
        batch.length === 1 ? '==' : 'in',
        batch.length === 1 ? batch[0] : batch
      )
      .orderBy('updatedAt.seconds', 'desc')
      .orderBy('updatedAt.nanoseconds', 'desc')
      .orderBy('enrollmentId', 'asc');
    if (options.cursor) {
      query = query.startAfter(
        options.cursor.updatedAtSeconds,
        options.cursor.updatedAtNanoseconds,
        options.cursor.enrollmentId
      );
    }
    const snapshot = await query.limit(options.pageSize + 1).get();

    for (const doc of snapshot.docs) {
      const parsed = parseIfVisibleInReadScope(doc.data(), parseCourseEnrollment, readScope);
      if (!parsed) {
        continue;
      }
      if (!canAccountViewEnrollment(authContext, accountId, parsed)) {
        continue;
      }
      enrollmentsById.set(parsed.enrollmentId, parsed);
    }
  }

  const ordered = [...enrollmentsById.values()].sort(compareEnrollmentReadOrder);
  return {
    enrollments: ordered.slice(0, options.pageSize),
    hasMore: ordered.length > options.pageSize,
  };
}

function groupEnrollmentAttendances(
  snapshot: Awaited<ReturnType<ReadModelRequestContext['attendancesForEnrollments']>>
): Map<CourseEnrollment['enrollmentId'], Map<CourseDay['courseDayId'], Attendance>> {
  const grouped = new Map<
    CourseEnrollment['enrollmentId'],
    Map<CourseDay['courseDayId'], Attendance>
  >();
  for (const document of snapshot.docs) {
    const attendance = parseAttendance(document.data() as Record<string, unknown>);
    if (!attendance || attendance.subject.subjectKind !== 'course_enrollment') continue;
    const byDay = grouped.get(attendance.subject.enrollmentId) ?? new Map();
    byDay.set(attendance.subject.courseDayId, attendance);
    grouped.set(attendance.subject.enrollmentId, byDay);
  }
  return grouped;
}

export async function queryCourseEnrollmentReadModels(
  firestore: Firestore,
  input: QueryCourseEnrollmentReadModelsInput,
  options: {
    readonly accountId?: AccountId;
    readonly instructorId?: InstructorId;
    readonly guestActionSecret?: string;
    readonly now?: Date;
    readonly readContext?: ReadModelRequestContext;
    readonly readScope?: CanonicalReadScope;
  } = {}
): Promise<QueryCourseEnrollmentReadModelsResult> {
  const readScope = options.readScope ?? options.readContext?.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const readContext = options.readContext ?? createReadModelRequestContext(firestore, { readScope });
  const pageSize = Math.min(
    input.pageSize ?? COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_DEFAULT,
    COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX
  );
  const now = timestampFromDate(options.now ?? new Date());
  const cursor = input.cursor ? decodeCourseEnrollmentReadModelCursor(input.cursor) : undefined;
  if (input.cursor && !cursor) {
    throw new InvalidCourseEnrollmentReadCursorError();
  }

  if (input.scope === 'guest_single') {
    const enrollmentId = input.enrollmentId!;
    const enrollmentSnap = await readContext.enrollment(enrollmentId);
    const enrollment = parseCourseEnrollment(
      enrollmentSnap.data() as Record<string, unknown> | undefined
    );
    if (!enrollment) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const courseSnap = await readContext.course(enrollment.courseId);
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const courseDays = await loadCourseDays(firestore, enrollment.courseId, readContext);

    const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret: options.guestActionSecret ?? '',
      nonce: input.guestActionNonce!,
      signature: input.guestActionSignature!,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt: course.scheduleProjection.finalCourseDayEndsAt,
    });
    if (!verification.valid) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const participantSnap = await readContext.participant(enrollment.participantId);
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const attendanceSnapshot = await readContext.enrollmentAttendances(enrollment.enrollmentId);
    const attendanceByEnrollment = groupEnrollmentAttendances(attendanceSnapshot);
    const progress = deriveCourseProgressPresentation({
      now,
      enrollment,
      course,
      courseDays,
      attendancesByCourseDayId: attendanceByEnrollment.get(enrollment.enrollmentId) ?? new Map(),
    });
    const item: CourseEnrollmentReadModel = {
      enrollmentId: enrollment.enrollmentId,
      revision: enrollment.revision,
      courseId: enrollment.courseId,
      ...(enrollment.originalCourseId !== enrollment.courseId
        ? { originalCourseId: enrollment.originalCourseId }
        : {}),
      participant: {
        participantId: participant.participantId,
        displayName: participant.displayName,
      },
      lifecycle: buildLifecycleProjection(enrollment),
      courseDisplay: { courseId: course.courseId, title: course.title },
      courseSchedule: buildCourseScheduleProjectionReadModel(course, courseDays),
      bookingOrigin: enrollment.attribution.bookingOrigin,
      authorizedActions: { canWithdraw: false, canRequestCancellation: false },
      courseProgress: courseProgressProjection(progress),
      updatedAt: enrollment.updatedAt,
    };
    return { scope: input.scope, items: [item], hasMore: false };
  }

  if (input.scope === 'instructor_roster') {
    const accountId = options.accountId;
    const instructorId = options.instructorId;
    const courseId = input.courseId!;
    if (!accountId || !instructorId) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const courseSnap = await readContext.course(courseId);
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const courseDays = await loadCourseDays(firestore, courseId, readContext);
    assertInstructorCourseRosterReadAccess({ instructorId, course, courseDays });
    const pageResult = await loadInstructorRosterEnrollmentPage(firestore, courseId, {
      pageSize,
      ...(cursor ? { cursor } : {}),
      readScope,
    });
    const items: InstructorCourseEnrollmentRosterItem[] = [];
    for (const enrollment of pageResult.enrollments) {
      const item = await buildInstructorCourseEnrollmentRosterItem(
        firestore,
        instructorId,
        enrollment,
        course,
        courseDays,
        readContext
      );
      if (item) {
        items.push(item);
      }
    }
    const last = pageResult.enrollments[pageResult.enrollments.length - 1];
    return {
      scope: input.scope,
      items,
      hasMore: pageResult.hasMore,
      ...(pageResult.hasMore && last
        ? {
            nextCursor: encodeCourseEnrollmentReadModelCursor({
              updatedAtSeconds: last.updatedAt.seconds,
              updatedAtNanoseconds: last.updatedAt.nanoseconds,
              enrollmentId: last.enrollmentId,
            }),
          }
        : {}),
    };
  }

  const accountId = options.accountId;
  if (!accountId) {
    return { scope: input.scope, items: [], hasMore: false };
  }

  const authContext = input.selectedParticipantId
    ? await loadSelectedCourseEnrollmentReadAuthorizationContext(
        accountId,
        input.selectedParticipantId,
        readContext
      )
    : await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId, readContext);
  if (
    cursor &&
    ((cursor.scope !== undefined && cursor.scope !== input.scope) ||
      cursor.participantId !== input.selectedParticipantId)
  ) {
    throw new InvalidCourseEnrollmentReadCursorError();
  }
  const enrollmentPage = await loadAuthorizedAccountEnrollmentPage(firestore, accountId, {
    pageSize,
    ...(cursor ? { cursor } : {}),
    ...(input.selectedParticipantId ? { selectedParticipantId: input.selectedParticipantId } : {}),
    authContext,
    readContext,
    readScope,
  });
  const courseCache = new Map<string, { course: Course; courseDays: CourseDay[] }>();
  const visibleEnrollments: CourseEnrollment[] = [];

  for (const enrollment of enrollmentPage.enrollments) {
    let cached = courseCache.get(enrollment.courseId);
    if (!cached) {
      const courseSnap = await readContext.course(enrollment.courseId);
      const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
      if (!course) {
        continue;
      }
      const courseDays = await loadCourseDays(firestore, enrollment.courseId, readContext);
      cached = { course, courseDays };
      courseCache.set(enrollment.courseId, cached);
    }

    const isHot = isCourseEnrollmentHot({
      lifecycleStatus: enrollment.lifecycle.status,
      finalCourseDayEndsAt: cached.course.scheduleProjection.finalCourseDayEndsAt,
      now,
    });
    if (input.scope === 'account_hot' && !isHot) {
      continue;
    }
    if (input.scope === 'account_history' && isHot) {
      continue;
    }

    visibleEnrollments.push(enrollment);
  }

  const attendanceGroups =
    visibleEnrollments.length > 0
      ? groupEnrollmentAttendances(
          await readContext.attendancesForEnrollments(
            visibleEnrollments.map((enrollment) => enrollment.enrollmentId)
          )
        )
      : new Map<CourseEnrollment['enrollmentId'], Map<CourseDay['courseDayId'], Attendance>>();
  const items: CourseEnrollmentReadModel[] = [];
  for (const enrollment of visibleEnrollments) {
    const cached = courseCache.get(enrollment.courseId)!;
    const item = await buildCourseEnrollmentReadModel(firestore, accountId, enrollment, {
      authContext,
      now,
      includeAttendanceSummary: true,
      courseContext: cached,
      attendancesByCourseDayId: attendanceGroups.get(enrollment.enrollmentId) ?? new Map(),
      readContext,
    });
    if (item) {
      items.push(item);
    }
  }

  const lastScanned = enrollmentPage.enrollments[enrollmentPage.enrollments.length - 1];
  return {
    scope: input.scope,
    items,
    hasMore: enrollmentPage.hasMore,
    ...(enrollmentPage.hasMore && lastScanned
      ? {
          nextCursor: encodeCourseEnrollmentReadModelCursor({
            updatedAtSeconds: lastScanned.updatedAt.seconds,
            updatedAtNanoseconds: lastScanned.updatedAt.nanoseconds,
            enrollmentId: lastScanned.enrollmentId,
            scope: input.scope,
            ...(input.selectedParticipantId ? { participantId: input.selectedParticipantId } : {}),
          }),
        }
      : {}),
  };
}
