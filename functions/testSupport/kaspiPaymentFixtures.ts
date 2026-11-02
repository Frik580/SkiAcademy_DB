// Test fixtures shared by isolated unit and Firestore emulator tests. No network calls.
import {
  AccountSchema,
  BookingSchema,
  BookingIdSchema,
  CourseEnrollmentSchema,
  PaymentSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  AggregateRevisionSchema,
  KASPI_CONFIGURATION_PATH,
  accountCommandActor,
  guestCommandActor,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  initialBookingOccurrenceIdFromBookingId,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  signGuestActionCredential,
  signGuestCourseEnrollmentActionCredential,
  GUEST_ACTION_TOKEN_VERSION,
  timestampFromDate,
  buildCourseSeatClaimIdentity,
  courseEnrollmentSeatOccurrenceId,
  courseSeatClaimInterval,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import { bookingClaimIds } from '../src/canonical/bookings/bookingClaimOperations';

export const kaspiAt = timestampFromDate(new Date('2026-01-01T10:00:00Z'));
export const kaspiSecret = 'kaspi-emulator-only-secret';
export const kaspiRequestA = 'd197f0ca-6727-40b3-854a-c6e62f94fabc';
export const kaspiRequestB = '1b510095-b829-4194-974f-8b295bdf55e8';
export const kaspiAccount = 'account_kaspi_student';
export const kaspiAdmin = 'account_kaspi_admin';
export const kaspiAdminB = 'account_kaspi_admin_b';
export const kaspiCorrelation = CorrelationIdSchema.parse('correlation_kaspi_test');
export const kaspiBookingId = BookingIdSchema.parse('booking_kaspi_guest');
const audit = {
  createdByCommandId: 'command_kaspi_seed',
  lastChangedByCommandId: 'command_kaspi_seed',
  correlationId: kaspiCorrelation,
};
export function kaspiAccountFixture(accountId: string) {
  return AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: kaspiAt,
    updatedAt: kaspiAt,
    audit,
  });
}
export function kaspiFixtures() {
  const booking = BookingSchema.parse({
    bookingId: kaspiBookingId,
    attribution: {
      bookingOrigin: 'guest',
      bookedBy: { kind: 'guest', guestSubjectId: guestSubjectIdFromBookingId(kaspiBookingId) },
    },
    party: { kind: 'individual', participantIds: ['participant_kaspi_guest'] },
    occurrence: {
      occurrenceId: initialBookingOccurrenceIdFromBookingId(kaspiBookingId),
      instructorId: 'instructor_kaspi_guest',
      interval: {
        startsAt: timestampFromDate(new Date('2026-01-02T10:00:00Z')),
        endsAt: timestampFromDate(new Date('2026-01-02T11:00:00Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: ['participant_kaspi_guest'] },
    },
    lifecycle: {
      status: 'pending',
      reservationExpiresAt: timestampFromDate(new Date('2026-01-01T11:00:00Z')),
    },
    paymentId: paymentIdFromBookingId(kaspiBookingId),
    revision: 1,
    createdAt: kaspiAt,
    updatedAt: kaspiAt,
    audit,
  });
  const course = canonicalCourseDeliveryFixtures.course;
  const enrollment = CourseEnrollmentSchema.parse({
    ...canonicalCourseDeliveryFixtures.confirmedEnrollment,
    attribution: {
      bookingOrigin: 'guest',
      bookedBy: {
        kind: 'guest',
        guestSubjectId: guestSubjectIdFromCourseEnrollmentId(
          canonicalCourseDeliveryFixtures.confirmedEnrollment.enrollmentId
        ),
      },
    },
    lifecycle: {
      status: 'pending',
      reservationExpiresAt: timestampFromDate(new Date('2026-01-02T10:00:00Z')),
    },
    payerAccountId: undefined,
    paymentId: paymentIdFromCourseEnrollmentId(
      canonicalCourseDeliveryFixtures.confirmedEnrollment.enrollmentId
    ),
  });
  const payment = (
    subjectType: 'booking' | 'course_enrollment',
    subjectId: string,
    paymentId: string
  ) =>
    PaymentSchema.parse({
      paymentId,
      subjectType,
      subjectId,
      currency: 'KZT',
      originalPrice: 10000,
      price: 10000,
      paidAmount: 0,
      refundedAmount: 0,
      retainedAmount: 0,
      settledAmount: 0,
      writtenOffAmount: 0,
      outstandingAmount: 10000,
      paymentStatus: 'unpaid',
      incrementalRequirements: [],
      revision: 1,
      eventRevision: 0,
      createdAt: kaspiAt,
      updatedAt: kaspiAt,
    });
  const docs: Record<string, Record<string, unknown>> = {
    [`users/${kaspiAccount}`]: { ...kaspiAccountFixture(kaspiAccount), role: 'student' },
    [`users/${kaspiAdmin}`]: { ...kaspiAccountFixture(kaspiAdmin), role: 'admin' },
    [`users/${kaspiAdminB}`]: { ...kaspiAccountFixture(kaspiAdminB), role: 'admin' },
    [KASPI_CONFIGURATION_PATH]: {
      enabled: true,
      provider: 'kaspi_manual',
      merchantKey: 'demo-merchant',
      qrImageUrl: 'https://example.invalid/test-only.png',
      merchantName: 'EMULATOR ONLY',
      legalApprovalReference: 'test only; never production',
      qrVerifiedBy: kaspiAdmin,
      qrVerifiedAt: kaspiAt,
      walletRequestTtlSeconds: 3600,
    },
    [`bookings/${booking.bookingId}`]: booking,
    [`payments/${booking.paymentId}`]: payment('booking', booking.bookingId, booking.paymentId),
    [`courses/${course.courseId}`]: course,
    [`course_enrollments/${enrollment.enrollmentId}`]: enrollment,
    [`payments/${enrollment.paymentId}`]: payment(
      'course_enrollment',
      enrollment.enrollmentId,
      enrollment.paymentId
    ),
  };
  for (const ids of bookingClaimIds(booking))
    for (const [id, identity] of [
      [ids.instructorClaimId, ids.instructorIdentity],
      [ids.participantClaimId, ids.participantIdentity],
    ] as const)
      docs[`resource_claims/${id}`] = {
        ...identity,
        claimId: id,
        dataScope: 'live',
        interval: booking.occurrence.interval,
        lifecycle: { status: 'active' },
        revision: 1,
        correlationId: kaspiCorrelation,
        lastChangedByCommandId: 'command_kaspi_seed',
        createdAt: kaspiAt,
        updatedAt: kaspiAt,
      };
  const seat = buildCourseSeatClaimIdentity({
    courseId: course.courseId,
    enrollmentId: enrollment.enrollmentId,
    occurrenceId: courseEnrollmentSeatOccurrenceId(enrollment.enrollmentId),
  });
  docs[`resource_claims/${seat.claimId}`] = {
    ...seat.identity,
    claimId: seat.claimId,
    dataScope: 'live',
    interval: courseSeatClaimInterval({ decidedAt: kaspiAt, course }),
    lifecycle: { status: 'active' },
    revision: 1,
    correlationId: kaspiCorrelation,
    lastChangedByCommandId: 'command_kaspi_seed',
    createdAt: kaspiAt,
    updatedAt: kaspiAt,
  };
  // Match real persisted documents: optional fields are absent, never undefined.
  return {
    docs: JSON.parse(JSON.stringify(docs)) as Record<string, Record<string, unknown>>,
    booking,
    enrollment,
  };
}
export function kaspiTopup(
  requestId = kaspiRequestA
): CommandEnvelope<'create_kaspi_payment_request'> {
  return {
    kind: 'create_kaspi_payment_request',
    intent: { type: 'wallet_topup', requestId, amount: 10000 as never },
    context: {
      actor: accountCommandActor(kaspiAccount as never),
      source: 'client_callable',
      exercisedCapability: 'account_owner',
      correlationId: kaspiCorrelation,
      idempotencyKey: IdempotencyKeySchema.parse(`kaspi_create_${requestId}`),
    },
  };
}
export function kaspiGuest(
  type: 'guest_booking_payment' | 'guest_course_payment',
  requestId = kaspiRequestA
): CommandEnvelope<'create_kaspi_payment_request'> {
  const { booking, enrollment } = kaspiFixtures();
  const isBooking = type === 'guest_booking_payment';
  const subjectId = isBooking ? booking.bookingId : enrollment.enrollmentId;
  const guestSubjectId = isBooking
    ? guestSubjectIdFromBookingId(booking.bookingId)
    : guestSubjectIdFromCourseEnrollmentId(enrollment.enrollmentId);
  const nonce = 'nonce_kaspi_test_123456789';
  const expiresAt = timestampFromDate(new Date('2026-01-10T10:00:00Z'));
  const signature = isBooking
    ? signGuestActionCredential(kaspiSecret, {
        version: GUEST_ACTION_TOKEN_VERSION,
        subjectKind: 'booking',
        bookingId: booking.bookingId,
        guestSubjectId,
        purpose: 'read_reservation_status',
        nonce,
        expiresAt,
      })
    : signGuestCourseEnrollmentActionCredential(kaspiSecret, {
        version: GUEST_ACTION_TOKEN_VERSION,
        subjectKind: 'course_enrollment',
        enrollmentId: enrollment.enrollmentId,
        guestSubjectId,
        purpose: 'link_guest_course_enrollment',
        nonce,
        expiresAt,
      });
  return {
    kind: 'create_kaspi_payment_request',
    intent: isBooking
      ? { type: 'guest_booking_payment', requestId, bookingId: subjectId }
      : { type: 'guest_course_payment', requestId, courseEnrollmentId: subjectId },
    context: {
      actor: guestCommandActor(guestSubjectId),
      source: 'guest_callable',
      exercisedCapability: 'guest',
      correlationId: kaspiCorrelation,
      idempotencyKey: IdempotencyKeySchema.parse(`kaspi_guest_${requestId}`),
      transportMetadata: {
        guest_action_nonce: nonce,
        guest_action_sig: signature,
        guest_profile_expires_at: JSON.stringify(expiresAt),
      },
    },
  };
}
export function kaspiReview(
  requestId = kaspiRequestA,
  revision = 1,
  action: CommandEnvelope<'review_kaspi_payment'>['intent']['action'] = 'confirm',
  extra: object = {},
  actor = kaspiAdmin
): CommandEnvelope<'review_kaspi_payment'> {
  return {
    kind: 'review_kaspi_payment',
    intent: {
      requestId,
      action,
      reason: 'Verified in emulator bank statement',
      ...(action === 'confirm'
        ? {
            receipt: {
              amount: 10000 as never,
              receivedAt: kaspiAt,
              bankReference: 'BANK-DEMO-001',
              matchingBasis: 'Verified payer and bank statement entry',
            },
          }
        : {}),
      ...extra,
    },
    context: {
      actor: accountCommandActor(actor as never),
      source: 'admin_callable',
      exercisedCapability: 'administrator',
      correlationId: kaspiCorrelation,
      expectedRevision: AggregateRevisionSchema.parse(revision),
      idempotencyKey: IdempotencyKeySchema.parse(
        `kaspi_review_${requestId}_${revision}_${action}_${actor}`
      ),
    },
  };
}

export function kaspiToggle(
  enabled: boolean,
  revision = 0,
  key = `kaspi_toggle_${revision}_${enabled}`
): CommandEnvelope<'set_kaspi_payment_enabled'> {
  return {
    kind: 'set_kaspi_payment_enabled',
    intent: { enabled },
    context: {
      ...kaspiReview().context,
      expectedRevision: AggregateRevisionSchema.parse(revision),
      idempotencyKey: IdempotencyKeySchema.parse(key),
    },
  };
}
