import type { IdempotencyKey } from '@ski-academy/shared-domain';

export function createRecordCourseDayAttendanceAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveRecordCourseDayAttendanceIdempotencyKey(attemptId: string): IdempotencyKey {
  return `record-course-day-attendance:${attemptId}` as IdempotencyKey;
}
