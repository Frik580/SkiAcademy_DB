import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveGuestCourseSessionParticipantId,
  GUEST_COURSE_SESSION_STORAGE_KEY,
  resolveGuestCourseSessionParticipantId,
} from '../../src/features/course-enrollments/deriveEnrollmentIds';

describe('guest course session identity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reuses a stable participantId across enrollments in the same browser', () => {
    const first = resolveGuestCourseSessionParticipantId();
    const second = resolveGuestCourseSessionParticipantId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(localStorage.getItem(GUEST_COURSE_SESSION_STORAGE_KEY)).toBeTruthy();
  });

  it('derives a different participantId for a different session seed', () => {
    expect(deriveGuestCourseSessionParticipantId('seed_a')).not.toBe(
      deriveGuestCourseSessionParticipantId('seed_b')
    );
  });
});
