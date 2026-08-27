import { describe, expect, it } from 'vitest';
import {
  CourseEnrollmentIdSchema,
  createGuestActionTokenNonce,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  signGuestActionCredential,
  signGuestCourseEnrollmentActionCredential,
  timestampFromDate,
  BookingIdSchema,
} from '@ski-academy/shared-domain';
import {
  verifyGuestActionCredentialPartsAuthoritative,
  verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative,
} from '../../functions/src/canonical/bookings/guestCredentialVerification';

const secret = 'guest-course-link-test-secret-01';
const enrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_guest_link_unit_01');
const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
const bookingId = BookingIdSchema.parse('booking_guest_link_cross_01');
const bookingGuestSubjectId = guestSubjectIdFromBookingId(bookingId);
const expiresAt = timestampFromDate(new Date('2026-03-01T12:00:00.000Z'));
const now = timestampFromDate(new Date('2026-02-01T12:00:00.000Z'));

describe('guest course enrollment link credential', () => {
  it('accepts a valid course enrollment credential', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(true);
  });

  it('rejects booking credentials for course enrollment linking', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'booking',
      bookingId,
      guestSubjectId: bookingGuestSubjectId,
      purpose: 'cancel_pending_reservation',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
  });

  it('rejects wrong enrollment scope', () => {
    const otherEnrollmentId = CourseEnrollmentIdSchema.parse(
      'course_enrollment_guest_link_unit_02'
    );
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId: otherEnrollmentId,
      guestSubjectId: guestSubjectIdFromCourseEnrollmentId(otherEnrollmentId),
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
  });

  it('rejects wrong guest subject id', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: bookingGuestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
  });

  it('rejects wrong purpose', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'cancel_pending_reservation',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
  });

  it('accepts credentials just before expiresAt (exclusive expiry boundary)', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now: timestampFromDate(new Date('2026-03-01T11:59:59.999Z')),
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(true);
  });

  it('rejects credentials exactly at expiresAt', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now: expiresAt,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
    if (!verification.valid) {
      expect(verification.reason).toBe('expired');
    }
  });

  it('rejects credentials just after expiresAt', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now: timestampFromDate(new Date('2026-03-01T12:00:00.001Z')),
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
    if (!verification.valid) {
      expect(verification.reason).toBe('expired');
    }
  });

  it('rejects tampered signatures', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestCourseEnrollmentActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'course_enrollment',
      enrollmentId,
      guestSubjectId,
      purpose: 'link_guest_course_enrollment',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature: `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`,
      now,
      expectedEnrollmentId: enrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
      expiresAt,
    });
    expect(verification.valid).toBe(false);
  });
});

describe('guestSubjectIdFromCourseEnrollmentId', () => {
  it('derives deterministic guest subject identity from enrollment id', () => {
    expect(guestSubjectIdFromCourseEnrollmentId(enrollmentId)).toBe(guestSubjectId);
    expect(guestSubjectIdFromCourseEnrollmentId(enrollmentId)).not.toBe(bookingGuestSubjectId);
  });
});

describe('booking credential still verifies with subjectKind', () => {
  it('accepts booking cancel credential', () => {
    const nonce = createGuestActionTokenNonce();
    const signature = signGuestActionCredential(secret, {
      version: 'guest-token:v1',
      subjectKind: 'booking',
      bookingId,
      guestSubjectId: bookingGuestSubjectId,
      purpose: 'cancel_pending_reservation',
      expiresAt,
      nonce,
    });
    const verification = verifyGuestActionCredentialPartsAuthoritative({
      secret,
      nonce,
      signature,
      now,
      expectedBookingId: bookingId,
      expectedGuestSubjectId: bookingGuestSubjectId,
      expectedPurpose: 'cancel_pending_reservation',
      expiresAt,
    });
    expect(verification.valid).toBe(true);
  });
});
