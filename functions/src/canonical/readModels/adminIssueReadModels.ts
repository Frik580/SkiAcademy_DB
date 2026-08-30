import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_DEFAULT,
  ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_MAX,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  adminIssueKindPolicy,
  attendanceIdFromBookingIdentity,
  attendanceIdFromCourseDayIdentity,
  decodeAdminIssueReadModelCursor,
  encodeAdminIssueReadModelCursor,
  evaluateAdminIssueAuthorizedActions,
  paymentIdMatchesSubject,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  type AdminIssue,
  type AdminIssueBlockingCondition,
  type AdminIssueInboxItem,
  type AdminIssueResolutionGuidance,
  type Attendance,
  type QueryAdminIssueReadModelsInput,
  type QueryAdminIssueReadModelsResult,
  type ReadModelAdministratorActor,
} from '@ski-academy/shared-domain';
import { parseAdminIssue } from '../adminIssues';
import { parseAttendance } from '../bookings/attendanceStore';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parsePayment } from '../finance/financeStore';
import { parseParticipant } from '../participantAccess/participantAccessStore';

export class InvalidAdminIssueReadCursorError extends Error {
  constructor() {
    super('The AdminIssue cursor is invalid for this query.');
    this.name = 'InvalidAdminIssueReadCursorError';
  }
}

function adminIssueReadIntegrityError(resource: string, id: string): Error {
  return new Error(`Canonical AdminIssue read integrity failure: ${resource}/${id}`);
}

function parseIssueDocument(id: string, data: Record<string, unknown> | undefined): AdminIssue {
  const issue = parseAdminIssue(data);
  if (!issue || issue.issueId !== id) {
    throw adminIssueReadIntegrityError('admin_issues', id);
  }
  return issue;
}

function assertAttendanceMatchesIssue(issue: AdminIssue, attendance: Attendance): void {
  if (issue.subjectRef.subjectKind === 'booking') {
    if (
      attendance.subject.subjectKind !== 'booking' ||
      attendance.subject.bookingId !== issue.subjectRef.bookingId ||
      (issue.occurrenceId !== undefined &&
        attendance.subject.occurrenceId !== issue.occurrenceId) ||
      (issue.participantId !== undefined &&
        attendance.subject.participantId !== issue.participantId)
    ) {
      throw adminIssueReadIntegrityError('attendance', attendance.attendanceId);
    }
    return;
  }

  if (
    attendance.subject.subjectKind !== 'course_enrollment' ||
    attendance.subject.enrollmentId !== issue.subjectRef.enrollmentId ||
    (issue.courseDayId !== undefined && attendance.subject.courseDayId !== issue.courseDayId) ||
    (issue.participantId !== undefined && attendance.subject.participantId !== issue.participantId)
  ) {
    throw adminIssueReadIntegrityError('attendance', attendance.attendanceId);
  }
}

function parseIssueAttendanceDocument(
  issue: AdminIssue,
  id: string,
  data: Record<string, unknown> | undefined
): Attendance {
  const attendance = parseAttendance(data);
  if (!attendance || attendance.attendanceId !== id) {
    throw adminIssueReadIntegrityError('attendance', id);
  }
  assertAttendanceMatchesIssue(issue, attendance);
  return attendance;
}

function blockingConditionForIssue(issue: AdminIssue): AdminIssueBlockingCondition {
  if (issue.blocksOutcome && issue.blocksDelivery) return 'outcome_and_delivery';
  if (issue.blocksOutcome) return 'outcome';
  if (issue.blocksDelivery) return 'delivery';
  return 'none';
}

function lifecycleProjection(issue: AdminIssue): AdminIssueInboxItem['lifecycle'] {
  const lifecycle = issue.lifecycle;
  return {
    status: lifecycle.status,
    openedAt: lifecycle.openedAt,
    lastDetectedAt: lifecycle.lastDetectedAt,
    ...(lifecycle.reopenedAt === undefined ? {} : { reopenedAt: lifecycle.reopenedAt }),
    ...(lifecycle.status === 'open' ? {} : { resolvedAt: lifecycle.resolvedAt }),
  };
}

export function buildAdminIssueInboxItem(issue: AdminIssue): AdminIssueInboxItem {
  const policy = adminIssueKindPolicy(issue.kind);
  return {
    issueId: issue.issueId,
    revision: issue.revision,
    kind: issue.kind,
    severity: issue.severity,
    lifecycle: lifecycleProjection(issue),
    subjectRef: issue.subjectRef,
    summaryCode: issue.kind,
    actionRequirement:
      issue.lifecycle.status === 'open' && policy.requireCoupledDomainCommandToResolve
        ? 'action_required'
        : 'informational',
    blockingCondition: blockingConditionForIssue(issue),
    ...(issue.occurrenceId === undefined ? {} : { occurrenceId: issue.occurrenceId }),
    ...(issue.participantId === undefined ? {} : { participantId: issue.participantId }),
    ...(issue.courseDayId === undefined ? {} : { courseDayId: issue.courseDayId }),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

function resolutionGuidanceForIssue(issue: AdminIssue): AdminIssueResolutionGuidance {
  switch (issue.kind) {
    case 'missing_attendance':
      return 'record_attendance';
    case 'payment_required_at_start':
      return 'fund_payment';
    case 'unresolved_pending_cancellation':
      return 'resolve_cancellation';
    case 'attendance_payment_conflict':
      return 'correct_finance';
    case 'resource_reconciliation_mismatch':
      return 'reconcile_subject';
    case 'financial_reconciliation_mismatch':
      return 'correct_finance';
    case 'outcome_correction_required':
      return 'correct_attendance_outcome';
  }
}

async function loadIssueAttendance(firestore: Firestore, issue: AdminIssue): Promise<Attendance[]> {
  if (issue.subjectRef.subjectKind === 'booking' && issue.occurrenceId && issue.participantId) {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: issue.occurrenceId,
      participantId: issue.participantId,
    });
    const snapshot = await firestore.collection('attendance').doc(attendanceId).get();
    return snapshot.exists
      ? [
          parseIssueAttendanceDocument(
            issue,
            snapshot.id,
            snapshot.data() as Record<string, unknown>
          ),
        ]
      : [];
  }

  if (issue.subjectRef.subjectKind !== 'course_enrollment') {
    return [];
  }

  if (issue.courseDayId) {
    const attendanceId = attendanceIdFromCourseDayIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'course_enrollment',
      enrollmentId: issue.subjectRef.enrollmentId,
      courseDayId: issue.courseDayId,
    });
    const snapshot = await firestore.collection('attendance').doc(attendanceId).get();
    return snapshot.exists
      ? [
          parseIssueAttendanceDocument(
            issue,
            snapshot.id,
            snapshot.data() as Record<string, unknown>
          ),
        ]
      : [];
  }

  const snapshot = await firestore
    .collection('attendance')
    .where('subject.enrollmentId', '==', issue.subjectRef.enrollmentId)
    .limit(64)
    .get();
  return snapshot.docs.map((document) =>
    parseIssueAttendanceDocument(issue, document.id, document.data() as Record<string, unknown>)
  );
}

export async function buildAdminIssueDetail(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  issue: AdminIssue
) {
  const subjectId =
    issue.subjectRef.subjectKind === 'booking'
      ? issue.subjectRef.bookingId
      : issue.subjectRef.enrollmentId;
  const subjectSnapshot = await firestore
    .collection(issue.subjectRef.subjectKind === 'booking' ? 'bookings' : 'course_enrollments')
    .doc(subjectId)
    .get();
  const booking =
    issue.subjectRef.subjectKind === 'booking'
      ? subjectSnapshot.exists
        ? parseBooking(subjectSnapshot.data() as Record<string, unknown>)
        : undefined
      : undefined;
  const enrollment =
    issue.subjectRef.subjectKind === 'course_enrollment'
      ? subjectSnapshot.exists
        ? parseCourseEnrollment(subjectSnapshot.data() as Record<string, unknown>)
        : undefined
      : undefined;
  if (
    (subjectSnapshot.exists && !booking && !enrollment) ||
    (booking &&
      (issue.subjectRef.subjectKind !== 'booking' ||
        booking.bookingId !== issue.subjectRef.bookingId)) ||
    (enrollment &&
      (issue.subjectRef.subjectKind !== 'course_enrollment' ||
        enrollment.enrollmentId !== issue.subjectRef.enrollmentId)) ||
    (issue.participantId !== undefined &&
      enrollment !== undefined &&
      enrollment.participantId !== issue.participantId) ||
    (issue.participantId !== undefined &&
      booking !== undefined &&
      !booking.party.participantIds.includes(issue.participantId)) ||
    (booking !== undefined && booking.paymentId !== paymentIdFromBookingId(booking.bookingId)) ||
    (enrollment !== undefined &&
      enrollment.paymentId !== paymentIdFromCourseEnrollmentId(enrollment.enrollmentId))
  ) {
    throw adminIssueReadIntegrityError(
      issue.subjectRef.subjectKind === 'booking' ? 'bookings' : 'course_enrollments',
      subjectId
    );
  }

  const paymentId =
    issue.subjectRef.subjectKind === 'booking'
      ? paymentIdFromBookingId(issue.subjectRef.bookingId)
      : paymentIdFromCourseEnrollmentId(issue.subjectRef.enrollmentId);
  const paymentSnapshot = await firestore.collection('payments').doc(paymentId).get();
  const payment = paymentSnapshot.exists
    ? parsePayment(paymentSnapshot.data() as Record<string, unknown>)
    : undefined;
  const expectedPaymentSubject =
    issue.subjectRef.subjectKind === 'booking'
      ? {
          subjectType: 'booking' as const,
          subjectId: issue.subjectRef.bookingId,
        }
      : {
          subjectType: 'course_enrollment' as const,
          subjectId: issue.subjectRef.enrollmentId,
        };
  if (
    paymentSnapshot.exists &&
    (!payment ||
      payment.paymentId !== paymentId ||
      !paymentIdMatchesSubject(payment, expectedPaymentSubject))
  ) {
    throw adminIssueReadIntegrityError('payments', paymentId);
  }

  const attendance = await loadIssueAttendance(firestore, issue);
  for (const record of attendance) {
    if (
      enrollment &&
      (record.subject.subjectKind !== 'course_enrollment' ||
        record.subject.courseId !== enrollment.courseId ||
        record.subject.participantId !== enrollment.participantId)
    ) {
      throw adminIssueReadIntegrityError('attendance', record.attendanceId);
    }
    if (
      booking &&
      (record.subject.subjectKind !== 'booking' ||
        !booking.party.participantIds.includes(record.subject.participantId))
    ) {
      throw adminIssueReadIntegrityError('attendance', record.attendanceId);
    }
  }
  const participantId =
    issue.participantId ??
    enrollment?.participantId ??
    (booking?.party.participantIds.length === 1 ? booking.party.participantIds[0] : undefined);
  const participantSnapshot = participantId
    ? await firestore.collection('participants').doc(participantId).get()
    : undefined;
  const participant = participantSnapshot
    ? participantSnapshot.exists
      ? parseParticipant(participantSnapshot.data() as Record<string, unknown>)
      : undefined
    : undefined;
  if (
    participantSnapshot?.exists &&
    (!participant || participant.participantId !== participantId)
  ) {
    throw adminIssueReadIntegrityError('participants', participantId!);
  }

  const subjectRevision = booking?.revision ?? enrollment?.revision;
  const subjectLifecycleStatus = booking?.lifecycle.status ?? enrollment?.lifecycle.status;
  const courseAttendance = attendance.find(
    (record) => record.subject.subjectKind === 'course_enrollment'
  );
  const attendanceCourseId =
    courseAttendance?.subject.subjectKind === 'course_enrollment'
      ? courseAttendance.subject.courseId
      : undefined;
  const courseId = enrollment?.courseId ?? attendanceCourseId;

  const attendancePresentation = attendance.map((record) => ({
    attendanceId: record.attendanceId,
    attendanceStatus: record.attendanceStatus,
    revision: record.revision,
    participantId: record.subject.participantId,
    occurrenceId: record.subject.occurrenceId,
    ...(record.subject.subjectKind === 'course_enrollment'
      ? { courseDayId: record.subject.courseDayId }
      : {}),
    updatedAt: record.updatedAt,
  }));

  return {
    ...buildAdminIssueInboxItem(issue),
    subject:
      subjectRevision === undefined || subjectLifecycleStatus === undefined
        ? { availability: 'missing' as const }
        : {
            availability: 'available' as const,
            revision: subjectRevision,
            lifecycleStatus: subjectLifecycleStatus,
            ...(courseId === undefined ? {} : { courseId }),
          },
    ...(participant
      ? {
          participant: {
            participantId: participant.participantId,
            displayName: participant.displayName,
          },
        }
      : {}),
    ...(payment
      ? {
          payment: {
            paymentId: payment.paymentId,
            paymentStatus: payment.paymentStatus,
            revision: payment.revision,
            price: payment.price,
            settledAmount: payment.settledAmount,
            outstandingAmount: payment.outstandingAmount,
          },
        }
      : {}),
    attendance: attendancePresentation,
    references: {
      ...(participantId === undefined ? {} : { participantId }),
      ...(courseId === undefined ? {} : { courseId }),
      ...(issue.courseDayId === undefined ? {} : { courseDayId: issue.courseDayId }),
      ...(payment ? { paymentId: payment.paymentId } : {}),
      attendanceIds: attendance.map((record) => record.attendanceId),
    },
    resolutionGuidance: resolutionGuidanceForIssue(issue),
    authorizedActions: evaluateAdminIssueAuthorizedActions({
      actor,
      issue,
      revisions: {
        ...(subjectRevision === undefined ? {} : { subjectRevision }),
        ...(payment?.revision === undefined ? {} : { paymentRevision: payment.revision }),
        attendanceRevisions: attendance.map((record) => ({
          attendanceId: record.attendanceId,
          revision: record.revision,
        })),
      },
    }),
  };
}

function listQuery(firestore: Firestore, input: QueryAdminIssueReadModelsInput): Query {
  let query: Query = firestore.collection('admin_issues');
  query =
    input.scope === 'admin_open'
      ? query.where('lifecycle.status', '==', 'open')
      : query.where('lifecycle.status', 'in', ['resolved', 'dismissed']);
  if (input.severity) {
    query = query.where('severity', '==', input.severity);
  }
  query = query
    .orderBy('updatedAt.seconds', 'desc')
    .orderBy('updatedAt.nanoseconds', 'desc')
    .orderBy('issueId', 'asc');

  const cursor = input.cursor ? decodeAdminIssueReadModelCursor(input.cursor) : undefined;
  if (
    input.cursor &&
    (!cursor || cursor.scope !== input.scope || cursor.severity !== input.severity)
  ) {
    throw new InvalidAdminIssueReadCursorError();
  }
  if (cursor) {
    query = query.startAfter(cursor.updatedAtSeconds, cursor.updatedAtNanoseconds, cursor.issueId);
  }
  return query;
}

export async function queryAdminIssueReadModels(
  firestore: Firestore,
  actor: ReadModelAdministratorActor,
  input: QueryAdminIssueReadModelsInput
): Promise<QueryAdminIssueReadModelsResult> {
  if (input.scope === 'admin_detail') {
    const snapshot = await firestore.collection('admin_issues').doc(input.issueId!).get();
    if (!snapshot.exists) {
      return { scope: 'admin_detail' };
    }
    const issue = parseIssueDocument(snapshot.id, snapshot.data() as Record<string, unknown>);
    return {
      scope: 'admin_detail',
      ...(issue ? { item: await buildAdminIssueDetail(firestore, actor, issue) } : {}),
    };
  }

  const pageSize = Math.min(
    input.pageSize ?? ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_DEFAULT,
    ADMIN_ISSUE_READ_MODEL_PAGE_SIZE_MAX
  );
  const snapshot = await listQuery(firestore, input)
    .limit(pageSize + 1)
    .get();
  const issues = snapshot.docs.map((document) =>
    parseIssueDocument(document.id, document.data() as Record<string, unknown>)
  );
  const page = issues.slice(0, pageSize);
  const hasMore = issues.length > pageSize;
  const last = page[page.length - 1];

  return {
    scope: input.scope,
    items: page.map(buildAdminIssueInboxItem),
    hasMore,
    ...(hasMore && last
      ? {
          nextCursor: encodeAdminIssueReadModelCursor({
            scope: input.scope,
            ...(input.severity === undefined ? {} : { severity: input.severity }),
            updatedAtSeconds: last.updatedAt.seconds,
            updatedAtNanoseconds: last.updatedAt.nanoseconds,
            issueId: last.issueId,
          }),
        }
      : {}),
  };
}
