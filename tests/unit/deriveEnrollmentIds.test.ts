import { describe, expect, it } from 'vitest';
import { IdempotencyKeySchema } from '@ski-academy/shared-domain';
import { deriveAuthenticatedCreateEnrollmentIdempotencyKey } from '../../src/features/course-enrollments/deriveEnrollmentIds';

const COURSE_ID = 'course_bc6334b4d1724f998a7b649bf2c66ed8';
const ALEX = 'staging-participant-alex';
const MIA = 'staging-participant-mia';

function assertValidIdempotencyKey(key: string): void {
  const parsed = IdempotencyKeySchema.safeParse(key);
  expect(parsed.success).toBe(true);
  expect(key.length).toBeLessThanOrEqual(200);
}

describe('deriveAuthenticatedCreateEnrollmentIdempotencyKey', () => {
  it('produces a valid key for one participant', () => {
    const key = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX]);
    assertValidIdempotencyKey(key);
    expect(key).toMatch(/^create-course-enrollment:/);
  });

  it('produces a valid key for two participants', () => {
    const key = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX, MIA]);
    assertValidIdempotencyKey(key);
    expect(key).not.toContain(',');
  });

  it('produces a valid key for eight participants', () => {
    const participants = Array.from({ length: 8 }, (_, index) => `staging-participant-p${index}`);
    const key = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, participants);
    assertValidIdempotencyKey(key);
  });

  it('is order-independent for the same participant set', () => {
    const forward = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX, MIA]);
    const reverse = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [MIA, ALEX]);
    expect(forward).toBe(reverse);
  });

  it('changes when one participant in the set changes', () => {
    const pair = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX, MIA]);
    const solo = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX]);
    expect(pair).not.toBe(solo);
  });

  it('is stable across repeated calls', () => {
    const first = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX, MIA]);
    const second = deriveAuthenticatedCreateEnrollmentIdempotencyKey(COURSE_ID, [ALEX, MIA]);
    expect(first).toBe(second);
  });

  it('stays within schema bound for maximum-length course id', () => {
    const maxCourseId = `course_${'a'.repeat(121)}`;
    const participants = Array.from({ length: 8 }, (_, index) => `participant_${index}_x`);
    const key = deriveAuthenticatedCreateEnrollmentIdempotencyKey(maxCourseId, participants);
    assertValidIdempotencyKey(key);
  });
});
