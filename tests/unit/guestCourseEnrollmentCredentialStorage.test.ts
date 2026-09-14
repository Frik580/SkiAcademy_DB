import { beforeEach, describe, expect, it } from 'vitest';
import { timestampFromDate } from '@ski-academy/shared-domain';
import {
  listStoredGuestCourseEnrollmentCredentials,
  persistGuestCourseEnrollmentCredential,
  readGuestCourseEnrollmentCredential,
} from '../../src/features/course-enrollments/guestCourseEnrollmentCredentialStorage';

describe('guestCourseEnrollmentCredentialStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lists persisted credentials for reload hydration', () => {
    const credential = {
      enrollmentId: 'enrollment_guest_list_01',
      guestSubjectId: 'a'.repeat(64),
      nonce: 'nonce_fixture_16chars',
      signature: 'b'.repeat(64),
      expiresAt: timestampFromDate(new Date('2099-01-01T00:00:00.000Z')),
    };
    persistGuestCourseEnrollmentCredential(credential as never);
    const listed = listStoredGuestCourseEnrollmentCredentials();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.enrollmentId).toBe(credential.enrollmentId);
    expect(readGuestCourseEnrollmentCredential(credential.enrollmentId).credential).toBeDefined();
  });
});
