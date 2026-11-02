import { createHash } from 'node:crypto';
import {
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  KaspiPaymentRequestSchema,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  normalizeFirestoreDocument,
  type CanonicalTimestamp,
  type KaspiPaymentRequest,
} from '@ski-academy/shared-domain';
import {
  verifyGuestActionCredentialPartsAuthoritative,
  verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative,
} from '../bookings/guestCredentialVerification';

export const kaspiRequestPath = (id: string) => `payment_requests/${id}`;
export function parseKaspiRequest(
  data: Record<string, unknown> | undefined
): KaspiPaymentRequest | undefined {
  const parsed = KaspiPaymentRequestSchema.safeParse(normalizeFirestoreDocument(data));
  return parsed.success ? parsed.data : undefined;
}
export function kaspiReceiptGuardPath(
  merchantKey: string,
  reference: string,
  refund = false
): string {
  // Whitespace/case differences must not permit reuse of the same bank reference.
  const identity = JSON.stringify([
    merchantKey,
    reference.normalize('NFKC').replace(/\s+/g, '').toUpperCase(),
  ]);
  return `bank_receipt_guards/${refund ? 'refund_' : 'receipt_'}${createHash('sha256').update(identity).digest('hex')}`;
}
export function verifyKaspiGuestCredential(input: {
  type: 'guest_booking_payment' | 'guest_course_payment';
  subjectId: string;
  nonce: string;
  signature: string;
  expiresAt: CanonicalTimestamp;
  now: CanonicalTimestamp;
  secret?: string;
}): boolean {
  if (!input.secret || !/^[A-Za-z0-9_-]{16,64}$/.test(input.nonce)) return false;
  const common = {
    secret: input.secret,
    nonce: input.nonce,
    signature: input.signature,
    expiresAt: input.expiresAt,
    now: input.now,
  };
  if (input.type === 'guest_booking_payment') {
    const id = BookingIdSchema.safeParse(input.subjectId);
    return (
      id.success &&
      verifyGuestActionCredentialPartsAuthoritative({
        ...common,
        expectedBookingId: id.data,
        expectedGuestSubjectId: guestSubjectIdFromBookingId(id.data),
        expectedPurpose: 'read_reservation_status',
      }).valid
    );
  }
  const id = CourseEnrollmentIdSchema.safeParse(input.subjectId);
  return (
    id.success &&
    verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      ...common,
      expectedEnrollmentId: id.data,
      expectedGuestSubjectId: guestSubjectIdFromCourseEnrollmentId(id.data),
      expectedPurpose: 'link_guest_course_enrollment',
    }).valid
  );
}
