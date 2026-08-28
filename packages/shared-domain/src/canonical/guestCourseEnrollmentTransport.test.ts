import { describe, expect, it } from 'vitest';
import {
  deriveGuestSubjectIdFromCourseEnrollmentIntent,
} from './guestCourseEnrollmentTransport';
import { guestSubjectIdFromCourseEnrollmentId } from './deterministicIdentity';

describe('guest course enrollment transport', () => {
  it('derives guest subject from client-supplied enrollmentId', () => {
    const enrollmentId = 'enrollment_guest_transport_01' as const;
    const subject = deriveGuestSubjectIdFromCourseEnrollmentIntent({
      courseId: 'course_guest_transport_01',
      participantIds: ['participant_guest_transport_01'],
      enrollmentIds: [enrollmentId],
    });
    expect(subject).toBe(guestSubjectIdFromCourseEnrollmentId(enrollmentId));
  });
});
