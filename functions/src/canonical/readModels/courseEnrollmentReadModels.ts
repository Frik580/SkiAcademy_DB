import {
  compareCanonicalTimestamps,
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
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type CourseEnrollmentReadModel,
  type CourseEnrollmentReadModelCursor,
  type CourseEnrollmentReadModelLifecycleProjection,
  type CourseEnrollmentReadModelPaymentPresentation,
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
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import { parsePayment } from '../finance/financeStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';
import { buildParticipantAccessTopology } from '../participantAccess/participantAccessAuthorization';
import { courseDaysCollectionPath, parseCourse, parseCourseDays } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { buildCourseScheduleProjectionReadModel } from './courseDayScheduleProjectionSupport';
import { loadLessonBookingReadAuthorizationContext } from './lessonBookingReadModels';
import { ReadModelAccessDeniedError } from './readModelAccessDenied';

export interface CourseEnrollmentReadAuthorizationContext {
  readonly account?: Account;
  readonly participantManagement: readonly ParticipantManagement[];
  readonly participants: readonly Participant[];
}

export async function loadCourseEnrollmentReadAuthorizationContext(
  firestore: Firestore,
  accountId: AccountId
): Promise<CourseEnrollmentReadAuthorizationContext> {
  return loadLessonBookingReadAuthorizationContext(firestore, accountId);
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

async function loadCourseDays(
  firestore: Firestore,
  courseId: Course['courseId']
): Promise<CourseDay[]> {
  const snapshot = await firestore.collection(courseDaysCollectionPath(courseId)).get();
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
  } = {}
): Promise<CourseEnrollmentReadModel | undefined> {
  const authContext =
    options.authContext ??
    (await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId));
  const now = options.now ?? timestampFromDate(new Date());

  if (!canAccountViewEnrollment(authContext, accountId, enrollment)) {
    return undefined;
  }

  const courseSnap = await firestore.collection('courses').doc(enrollment.courseId).get();
  const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
  if (!course) {
    return undefined;
  }

  const courseDays = await loadCourseDays(firestore, enrollment.courseId);
  const participantSnap = await firestore
    .collection('participants')
    .doc(enrollment.participantId)
    .get();
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

  const paymentSnap = await firestore
    .collection('payments')
    .doc(paymentIdFromCourseEnrollmentId(enrollment.enrollmentId))
    .get();
  const payment = parsePayment(paymentSnap.data() as Record<string, unknown> | undefined);

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
  courseDays: readonly CourseDay[]
): Promise<InstructorCourseEnrollmentRosterItem | undefined> {
  if (!isInstructorActiveRosterEnrollment(enrollment)) {
    return undefined;
  }

  const participantSnap = await firestore
    .collection('participants')
    .doc(enrollment.participantId)
    .get();
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

function isAfterCursor(
  enrollment: CourseEnrollment,
  cursor: CourseEnrollmentReadModelCursor
): boolean {
  const updatedCompare = compareCanonicalTimestamps(enrollment.updatedAt, {
    seconds: cursor.updatedAtSeconds,
    nanoseconds: cursor.updatedAtNanoseconds,
  });
  if (updatedCompare < 0) {
    return true;
  }
  if (updatedCompare > 0) {
    return false;
  }
  return enrollment.enrollmentId < cursor.enrollmentId;
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
  for (const doc of snapshot.docs) {
    const parsed = parseCourseEnrollment(doc.data() as Record<string, unknown>);
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
  courseId: Course['courseId']
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

async function loadAuthorizedAccountEnrollments(
  firestore: Firestore,
  accountId: AccountId
): Promise<CourseEnrollment[]> {
  const authContext = await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId);
  const participantIds = authContext.participantManagement.map(
    (management) => management.participantId
  );
  if (participantIds.length === 0) {
    return [];
  }

  const enrollmentsById = new Map<string, CourseEnrollment>();
  const batchSize = 10;
  for (let index = 0; index < participantIds.length; index += batchSize) {
    const batch = participantIds.slice(index, index + batchSize);
    const snapshot = await firestore
      .collection('course_enrollments')
      .where('participantId', 'in', batch)
      .limit(COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX * 4)
      .get();

    for (const doc of snapshot.docs) {
      const parsed = parseCourseEnrollment(doc.data() as Record<string, unknown>);
      if (!parsed) {
        continue;
      }
      if (!canAccountViewEnrollment(authContext, accountId, parsed)) {
        continue;
      }
      enrollmentsById.set(parsed.enrollmentId, parsed);
    }
  }

  return [...enrollmentsById.values()].sort(compareEnrollmentReadOrder);
}

export async function queryCourseEnrollmentReadModels(
  firestore: Firestore,
  input: QueryCourseEnrollmentReadModelsInput,
  options: {
    readonly accountId?: AccountId;
    readonly instructorId?: InstructorId;
    readonly guestActionSecret?: string;
    readonly now?: Date;
  } = {}
): Promise<QueryCourseEnrollmentReadModelsResult> {
  const pageSize = Math.min(
    input.pageSize ?? COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_DEFAULT,
    COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX
  );
  const now = timestampFromDate(options.now ?? new Date());
  const cursor = input.cursor ? decodeCourseEnrollmentReadModelCursor(input.cursor) : undefined;

  if (input.scope === 'guest_single') {
    const enrollmentId = input.enrollmentId!;
    const enrollmentSnap = await firestore.collection('course_enrollments').doc(enrollmentId).get();
    const enrollment = parseCourseEnrollment(
      enrollmentSnap.data() as Record<string, unknown> | undefined
    );
    if (!enrollment) {
      return { scope: input.scope, items: [], hasMore: false };
    }

    const courseSnap = await firestore.collection('courses').doc(enrollment.courseId).get();
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const courseDays = await loadCourseDays(firestore, enrollment.courseId);

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

    const participantSnap = await firestore
      .collection('participants')
      .doc(enrollment.participantId)
      .get();
    const participant = parseParticipant(
      participantSnap.data() as Record<string, unknown> | undefined
    );
    if (!participant) {
      return { scope: input.scope, items: [], hasMore: false };
    }

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

    const courseSnap = await firestore.collection('courses').doc(courseId).get();
    const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
    if (!course) {
      return { scope: input.scope, items: [], hasMore: false };
    }
    const courseDays = await loadCourseDays(firestore, courseId);
    assertInstructorCourseRosterReadAccess({ instructorId, course, courseDays });
    const pageResult = await loadInstructorRosterEnrollmentPage(firestore, courseId, {
      pageSize,
      ...(cursor ? { cursor } : {}),
    });
    const items: InstructorCourseEnrollmentRosterItem[] = [];
    for (const enrollment of pageResult.enrollments) {
      const item = await buildInstructorCourseEnrollmentRosterItem(
        firestore,
        instructorId,
        enrollment,
        course,
        courseDays
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

  const authContext = await loadCourseEnrollmentReadAuthorizationContext(firestore, accountId);
  const enrollments = await loadAuthorizedAccountEnrollments(firestore, accountId);
  const courseCache = new Map<string, { course: Course; courseDays: CourseDay[] }>();
  const items: CourseEnrollmentReadModel[] = [];

  for (const enrollment of enrollments) {
    if (cursor && !isAfterCursor(enrollment, cursor)) {
      continue;
    }
    let cached = courseCache.get(enrollment.courseId);
    if (!cached) {
      const courseSnap = await firestore.collection('courses').doc(enrollment.courseId).get();
      const course = parseCourse(courseSnap.data() as Record<string, unknown> | undefined);
      if (!course) {
        continue;
      }
      const courseDays = await loadCourseDays(firestore, enrollment.courseId);
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

    const item = await buildCourseEnrollmentReadModel(firestore, accountId, enrollment, {
      authContext,
      now,
      includeAttendanceSummary: true,
    });
    if (item) {
      items.push(item);
    }
    if (items.length >= pageSize + 1) {
      break;
    }
  }

  const page = items.slice(0, pageSize);
  const hasMore = items.length > pageSize;
  const last = page[page.length - 1];
  return {
    scope: input.scope,
    items: page,
    hasMore,
    ...(hasMore && last
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
