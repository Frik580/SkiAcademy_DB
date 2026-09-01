import {
  BookingIdSchema,
  BookingSchema,
  CanonicalCommandError,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  assertBookingPaymentIdentity,
  assertCourseEnrollmentPaymentIdentity,
  isCourseEnrollmentAllowedBeforeStart,
  isGuestBookingConfirmationAllowedBeforeStart,
  isGuestReservationExpired,
  isPaymentFullyFundedForService,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  timestampFromDate,
  type Booking,
  type CanonicalTimestamp,
  type CommandId,
  type CorrelationId,
  type CourseEnrollment,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  parseParticipantBlock,
  participantBlockPath,
} from '../participantAccess/participantAccessStore';
import {
  BOOKING_PLANNING_ESTIMATES,
  bookingPath,
  parseBooking,
  toFirestoreWritePayload as bookingToFirestoreWritePayload,
} from '../bookings/bookingStore';
import { bookingClaimIds, bookingClaimIdentities } from '../bookings/bookingClaimOperations';
import {
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
  courseEnrollmentPath,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
} from '../courses/courseEnrollmentStore';
import { coursePath, parseCourse } from '../courses/courseStore';

export type GuestPaymentConfirmationBlockReason =
  | 'payment_not_fully_funded'
  | 'not_guest'
  | 'already_confirmed'
  | 'terminal_or_non_pending'
  | 'reservation_expired'
  | 'service_started'
  | 'course_unavailable';

interface PlannedGuestPaymentConfirmationBase {
  readonly paymentId: Payment['paymentId'];
  readonly resultingRevision: number;
  commit(session: CanonicalAtomicTransactionSession, decidedAt: Date): void;
}

export type PlannedGuestPaymentConfirmation =
  | (PlannedGuestPaymentConfirmationBase & {
      readonly subjectKind: 'booking';
      readonly subjectId: Booking['bookingId'];
    })
  | (PlannedGuestPaymentConfirmationBase & {
      readonly subjectKind: 'course_enrollment';
      readonly subjectId: CourseEnrollment['enrollmentId'];
    });

export type GuestPaymentConfirmationDecision =
  | { readonly outcome: 'planned'; readonly plan: PlannedGuestPaymentConfirmation }
  | { readonly outcome: 'blocked'; readonly reason: GuestPaymentConfirmationBlockReason };

interface PlanGuestPaymentConfirmationInput {
  readonly session: CanonicalAtomicTransactionSession;
  readonly payment: Payment;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly now: CanonicalTimestamp;
}

function paymentSubjectMismatch(correlationId: CorrelationId): CanonicalCommandError {
  return new CanonicalCommandError('validation', {
    correlationId,
    details: { field: 'paymentId', reason: 'conflict' },
  });
}

function blocked(reason: GuestPaymentConfirmationBlockReason): GuestPaymentConfirmationDecision {
  return { outcome: 'blocked', reason };
}

async function planBookingConfirmation(
  input: PlanGuestPaymentConfirmationInput
): Promise<GuestPaymentConfirmationDecision> {
  const bookingId = BookingIdSchema.parse(input.payment.subjectId);
  const documentPath = bookingPath(bookingId);
  const bookingRead = await input.session.tx.get({ path: documentPath });
  input.session.plan.planRead({ path: documentPath, category: 'aggregate' });
  const booking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
  if (!booking || booking.paymentId !== input.payment.paymentId) {
    throw paymentSubjectMismatch(input.correlationId);
  }
  assertBookingPaymentIdentity(input.correlationId, booking, input.payment);
  if (booking.attribution.bookingOrigin !== 'guest') return blocked('not_guest');
  if (booking.lifecycle.status === 'confirmed') return blocked('already_confirmed');
  if (booking.lifecycle.status !== 'pending') return blocked('terminal_or_non_pending');
  if (
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: booking.lifecycle.reservationExpiresAt,
    })
  ) {
    return blocked('reservation_expired');
  }
  if (
    !isGuestBookingConfirmationAllowedBeforeStart({
      now: input.now,
      serviceStartsAt: booking.occurrence.interval.startsAt,
    })
  ) {
    return blocked('service_started');
  }

  const participantId = booking.party.participantIds[0]!;
  const instructorBlockDocumentPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId,
      instructorId: booking.occurrence.instructorId,
      createdByKind: 'instructor',
    })
  );
  const instructorBlockRead = await input.session.tx.get({ path: instructorBlockDocumentPath });
  input.session.plan.planRead({
    path: instructorBlockDocumentPath,
    category: 'authorization_check',
  });
  const instructorBlock = parseParticipantBlock(
    instructorBlockRead.exists ? instructorBlockRead.data : undefined
  );
  if (instructorBlock?.status === 'active') {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId: input.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }

  const claimIds = bookingClaimIds(booking);
  const instructorClaimId = bookingClaimIdentities({
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
    instructorId: booking.occurrence.instructorId,
    participantId,
  }).instructorClaimId;
  for (const claimId of [
    instructorClaimId,
    ...claimIds.map((identity) => identity.participantClaimId),
  ]) {
    const claimPath = `resource_claims/${claimId}`;
    const claimRead = await input.session.tx.get({ path: claimPath });
    input.session.plan.planRead({ path: claimPath, category: 'resource_claim' });
    if (!claimRead.exists) {
      throw new CanonicalCommandError('validation', {
        correlationId: input.correlationId,
        details: { resourceKind: 'booking', reason: 'conflict' },
      });
    }
  }

  const resultingRevision = nextAggregateRevision(booking.revision);
  input.session.plan.planMutation({
    path: documentPath,
    kind: 'update',
    category: 'aggregate',
    estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
  });

  return {
    outcome: 'planned',
    plan: {
      subjectKind: 'booking',
      subjectId: booking.bookingId,
      paymentId: input.payment.paymentId,
      resultingRevision,
      commit: (session, decidedAtDate) => {
        const decidedAt = timestampFromDate(decidedAtDate);
        const updatedBooking = BookingSchema.parse({
          ...booking,
          lifecycle: { status: 'confirmed' },
          occurrence: {
            ...booking.occurrence,
            serviceParty: {
              ...booking.occurrence.serviceParty,
              frozenAt: decidedAt,
            },
          },
          revision: resultingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: input.commandId,
            correlationId: input.correlationId,
          },
        });
        session.tx.update(
          { path: documentPath },
          bookingToFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
      },
    },
  };
}

async function planCourseEnrollmentConfirmation(
  input: PlanGuestPaymentConfirmationInput
): Promise<GuestPaymentConfirmationDecision> {
  const enrollmentId = CourseEnrollmentIdSchema.parse(input.payment.subjectId);
  const documentPath = courseEnrollmentPath(enrollmentId);
  const enrollmentRead = await input.session.tx.get({ path: documentPath });
  input.session.plan.planRead({ path: documentPath, category: 'aggregate' });
  const enrollment = parseCourseEnrollment(enrollmentRead.exists ? enrollmentRead.data : undefined);
  if (!enrollment || enrollment.paymentId !== input.payment.paymentId) {
    throw paymentSubjectMismatch(input.correlationId);
  }
  assertCourseEnrollmentPaymentIdentity(input.correlationId, enrollment, input.payment);
  if (enrollment.attribution.bookingOrigin !== 'guest') return blocked('not_guest');
  if (enrollment.lifecycle.status === 'confirmed') return blocked('already_confirmed');
  if (enrollment.lifecycle.status !== 'pending') return blocked('terminal_or_non_pending');
  if (
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: enrollment.lifecycle.reservationExpiresAt,
    })
  ) {
    return blocked('reservation_expired');
  }

  const courseDocumentPath = coursePath(enrollment.courseId);
  const courseRead = await input.session.tx.get({ path: courseDocumentPath });
  input.session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
  const course = parseCourse(courseRead.exists ? courseRead.data : undefined);
  if (!course) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'courseId', reason: 'conflict' },
    });
  }
  if (course.lifecycle !== 'active') return blocked('course_unavailable');
  if (!isCourseEnrollmentAllowedBeforeStart({ now: input.now, courseStartsAt: course.startAt })) {
    return blocked('service_started');
  }

  const resultingRevision = nextAggregateRevision(enrollment.revision);
  input.session.plan.planMutation({
    path: documentPath,
    kind: 'update',
    category: 'aggregate',
    estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
  });

  return {
    outcome: 'planned',
    plan: {
      subjectKind: 'course_enrollment',
      subjectId: enrollment.enrollmentId,
      paymentId: input.payment.paymentId,
      resultingRevision,
      commit: (session, decidedAtDate) => {
        const decidedAt = timestampFromDate(decidedAtDate);
        const updatedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          lifecycle: { status: 'confirmed' },
          revision: resultingRevision,
          updatedAt: decidedAt,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: input.commandId,
            correlationId: input.correlationId,
          },
        });
        session.tx.update(
          { path: documentPath },
          enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
        );
      },
    },
  };
}

export async function planGuestPaymentConfirmation(
  input: PlanGuestPaymentConfirmationInput
): Promise<GuestPaymentConfirmationDecision> {
  if (!isPaymentFullyFundedForService(input.payment)) {
    return blocked('payment_not_fully_funded');
  }
  if (input.payment.subjectType === 'booking') {
    return planBookingConfirmation(input);
  }
  return planCourseEnrollmentConfirmation(input);
}

export interface GuestPaymentConfirmationLifecycleMismatch {
  readonly subjectRevision: number;
}

export async function detectGuestPaymentConfirmationLifecycleMismatch(input: {
  readonly session: CanonicalAtomicTransactionSession;
  readonly payment: Payment;
  readonly correlationId: CorrelationId;
  readonly now: CanonicalTimestamp;
}): Promise<GuestPaymentConfirmationLifecycleMismatch | undefined> {
  if (!isPaymentFullyFundedForService(input.payment)) return undefined;
  if (input.payment.subjectType === 'booking') {
    const bookingId = BookingIdSchema.parse(input.payment.subjectId);
    const documentPath = bookingPath(bookingId);
    const read = await input.session.tx.get({ path: documentPath });
    input.session.plan.planRead({ path: documentPath, category: 'aggregate' });
    const booking = parseBooking(read.exists ? read.data : undefined);
    if (!booking) return undefined;
    assertBookingPaymentIdentity(input.correlationId, booking, input.payment);
    if (booking.attribution.bookingOrigin !== 'guest') return undefined;
    if (booking.lifecycle.status === 'cancelled') {
      return { subjectRevision: booking.revision };
    }
    if (booking.lifecycle.status !== 'pending') return undefined;
    return (
      isGuestReservationExpired({
        now: input.now,
        reservationExpiresAt: booking.lifecycle.reservationExpiresAt,
      }) ||
      !isGuestBookingConfirmationAllowedBeforeStart({
        now: input.now,
        serviceStartsAt: booking.occurrence.interval.startsAt,
      })
    )
      ? { subjectRevision: booking.revision }
      : undefined;
  }

  const enrollmentId = CourseEnrollmentIdSchema.parse(input.payment.subjectId);
  const enrollmentDocumentPath = courseEnrollmentPath(enrollmentId);
  const enrollmentRead = await input.session.tx.get({ path: enrollmentDocumentPath });
  input.session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
  const enrollment = parseCourseEnrollment(
    enrollmentRead.exists ? enrollmentRead.data : undefined
  );
  if (!enrollment) return undefined;
  assertCourseEnrollmentPaymentIdentity(input.correlationId, enrollment, input.payment);
  if (enrollment.attribution.bookingOrigin !== 'guest') return undefined;
  if (enrollment.lifecycle.status === 'cancelled' || enrollment.lifecycle.status === 'withdrawn') {
    return { subjectRevision: enrollment.revision };
  }
  if (enrollment.lifecycle.status !== 'pending') return undefined;
  if (
    isGuestReservationExpired({
      now: input.now,
      reservationExpiresAt: enrollment.lifecycle.reservationExpiresAt,
    })
  ) {
    return { subjectRevision: enrollment.revision };
  }
  const courseDocumentPath = coursePath(enrollment.courseId);
  const courseRead = await input.session.tx.get({ path: courseDocumentPath });
  input.session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
  const course = parseCourse(courseRead.exists ? courseRead.data : undefined);
  if (!course) return undefined;
  return (
    course.lifecycle !== 'active' ||
    !isCourseEnrollmentAllowedBeforeStart({ now: input.now, courseStartsAt: course.startAt })
  )
    ? { subjectRevision: enrollment.revision }
    : undefined;
}

export function resolveFinanceGuestPaymentConfirmationEffect(
  decision: GuestPaymentConfirmationDecision,
  correlationId: CorrelationId
): PlannedGuestPaymentConfirmation | undefined {
  if (decision.outcome === 'planned') return decision.plan;
  if (
    decision.reason === 'payment_not_fully_funded' ||
    decision.reason === 'not_guest' ||
    decision.reason === 'already_confirmed'
  ) {
    return undefined;
  }
  throw new CanonicalCommandError('invalid_transition', {
    correlationId,
    details: { field: 'lifecycle', reason: 'conflict' },
  });
}
