import {
  CanonicalCommandError,
  GUEST_COURSE_OUTSTANDING_HOLD_LIMIT_PER_COURSE,
  GUEST_LESSON_OUTSTANDING_HOLD_LIMIT_PER_INSTRUCTOR,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';

const OUTSTANDING_GUEST_HOLD_FILTERS = [
  { field: 'attribution.bookingOrigin', op: '==' as const, value: 'guest' },
  { field: 'lifecycle.status', op: '==' as const, value: 'pending' },
] as const;

/**
 * Counts live-scope unpaid guest holds for one instructor or course inside the
 * create transaction. Limit is the security ceiling, so the read stops at that
 * bound instead of scanning hold history.
 */
export async function countOutstandingGuestHolds(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly collection: 'bookings' | 'course_enrollments';
    readonly resourceField: 'occurrence.instructorId' | 'courseId';
    readonly resourceId: string;
    readonly limit: number;
  }
): Promise<number> {
  const dataScope = session.scope?.dataScope ?? 'live';
  const documents = await session.tx.query({
    collection: input.collection,
    where: { field: input.resourceField, op: '==', value: input.resourceId },
    and: [...OUTSTANDING_GUEST_HOLD_FILTERS, { field: 'dataScope', op: '==', value: dataScope }],
    limit: input.limit,
  });
  session.plan.planRead({
    path: `guest_hold_capacity/${input.collection}/${input.resourceId}`,
    category: 'authorization_check',
  });
  return documents.length;
}

export async function assertGuestLessonOutstandingHoldCapacity(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly instructorId: string;
    readonly correlationId: CorrelationId;
  }
): Promise<void> {
  const matched = await countOutstandingGuestHolds(session, {
    collection: 'bookings',
    resourceField: 'occurrence.instructorId',
    resourceId: input.instructorId,
    limit: GUEST_LESSON_OUTSTANDING_HOLD_LIMIT_PER_INSTRUCTOR,
  });
  if (matched + 1 > GUEST_LESSON_OUTSTANDING_HOLD_LIMIT_PER_INSTRUCTOR) {
    throw new CanonicalCommandError('unavailable', {
      correlationId: input.correlationId,
      details: {
        field: 'outstandingGuestHolds',
        resourceKind: 'instructor',
        reason: 'conflict',
      },
    });
  }
}

export async function assertGuestCourseOutstandingHoldCapacity(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly courseId: string;
    readonly additionalSeats: number;
    readonly correlationId: CorrelationId;
  }
): Promise<void> {
  if (input.additionalSeats <= 0) {
    return;
  }
  const matched = await countOutstandingGuestHolds(session, {
    collection: 'course_enrollments',
    resourceField: 'courseId',
    resourceId: input.courseId,
    limit: GUEST_COURSE_OUTSTANDING_HOLD_LIMIT_PER_COURSE,
  });
  if (matched + input.additionalSeats > GUEST_COURSE_OUTSTANDING_HOLD_LIMIT_PER_COURSE) {
    throw new CanonicalCommandError('unavailable', {
      correlationId: input.correlationId,
      details: {
        field: 'outstandingGuestHolds',
        resourceKind: 'course',
        reason: 'conflict',
      },
    });
  }
}
