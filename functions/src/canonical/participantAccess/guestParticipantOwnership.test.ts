import { describe, expect, it } from 'vitest';
import {
  CourseEnrollmentIdSchema,
  GUEST_ACTION_TOKEN_VERSION,
  ParticipantIdSchema,
  guestSubjectIdFromCourseEnrollmentId,
  signGuestCourseEnrollmentActionCredential,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';

describe('verified reused Participant course read credential', () => {
  const secret = 'synthetic-unit-test-secret';
  const enrollmentId = CourseEnrollmentIdSchema.parse('enrollment_read_credential_unit');
  const participantId = ParticipantIdSchema.parse('participant_read_credential_unit');
  const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
  const nonce = 'courseReadCredentialUnit';
  const now = timestampFromDate(new Date('2026-01-01T00:00:00Z'));
  const expiresAt = timestampFromDate(new Date('2026-02-01T00:00:00Z'));
  const purpose = 'read_verified_guest_course_participant';
  const signature = signGuestCourseEnrollmentActionCredential(secret, {
    version: GUEST_ACTION_TOKEN_VERSION,
    subjectKind: 'course_enrollment',
    enrollmentId,
    guestSubjectId,
    participantId,
    purpose,
    expiresAt,
    nonce,
  });
  const input = {
    secret,
    now,
    expiresAt,
    nonce,
    signature,
    expectedEnrollmentId: enrollmentId,
    expectedGuestSubjectId: guestSubjectId,
    expectedParticipantId: participantId,
    expectedPurpose: purpose,
  } as const;

  it('binds the signed read permission to the Enrollment and Participant', () => {
    expect(verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative(input).valid).toBe(true);
    expect(verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      ...input,
      expectedParticipantId: ParticipantIdSchema.parse('participant_read_credential_other'),
    }).valid).toBe(false);
    expect(verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      ...input,
      expectedEnrollmentId: CourseEnrollmentIdSchema.parse('enrollment_read_credential_other'),
    }).valid).toBe(false);
  });

  it('keeps read permission distinct from linking and expires it at the deadline', () => {
    expect(verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      ...input,
      expectedParticipantId: undefined,
      expectedPurpose: 'link_guest_course_enrollment',
    }).valid).toBe(false);
    expect(verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      ...input,
      now: expiresAt,
    })).toMatchObject({ valid: false, reason: 'expired' });
  });
});
