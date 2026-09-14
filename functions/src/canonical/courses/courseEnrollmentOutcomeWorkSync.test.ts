import { describe, expect, it } from 'vitest';
import { CourseEnrollmentSchema, timestampFromDate } from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import type { Firestore } from 'firebase-admin/firestore';
import { COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION } from './courseEnrollmentOutcomeWork';
import { syncCourseEnrollmentOutcomeWorkForEnrollmentWrite } from './courseEnrollmentOutcomeWorkSync';

function fakeFirestore(seed: Map<string, Record<string, unknown>>): Firestore {
  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => {
        const data = seed.get(`${path}/${id}`);
        return { exists: data !== undefined, id, data: () => data };
      },
      set: async (data: Record<string, unknown>) => {
        seed.set(`${path}/${id}`, data);
      },
    }),
    get: async () => ({
      docs: [...seed.entries()]
        .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })),
    }),
  });
  return { collection } as unknown as Firestore;
}

function canonicalSeed() {
  const { course, courseDays, confirmedEnrollment } = canonicalCourseDeliveryFixtures;
  return new Map<string, Record<string, unknown>>([
    [
      `course_enrollments/${confirmedEnrollment.enrollmentId}`,
      confirmedEnrollment as Record<string, unknown>,
    ],
    [`courses/${course.courseId}`, course as Record<string, unknown>],
    [
      `courses/${course.courseId}/days/${courseDays[0].courseDayId}`,
      courseDays[0] as Record<string, unknown>,
    ],
    [
      `courses/${course.courseId}/days/${courseDays[1].courseDayId}`,
      courseDays[1] as Record<string, unknown>,
    ],
  ]);
}

describe('T32.9A.9C.B CourseEnrollment outcome work sync', () => {
  it('creates pending work for a confirmed canonical Enrollment and reuses it on replay', async () => {
    const seed = canonicalSeed();
    const enrollment = canonicalCourseDeliveryFixtures.confirmedEnrollment;
    const firestore = fakeFirestore(seed);
    await expect(
      syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
        rawEnrollmentId: enrollment.enrollmentId,
        now: new Date('2026-01-10T00:00:00.000Z'),
      })
    ).resolves.toBe('pending_created');
    await expect(
      syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
        rawEnrollmentId: enrollment.enrollmentId,
        now: new Date('2026-01-11T00:00:00.000Z'),
      })
    ).resolves.toBe('unchanged');
    expect(
      seed.get(`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${enrollment.enrollmentId}`)
    ).toMatchObject({ status: 'pending', attemptCount: 0 });
  });

  it('creates no work for guest pending and closes work after an immediate terminal outcome', async () => {
    const seed = canonicalSeed();
    const { confirmedEnrollment, guestPendingEnrollment } = canonicalCourseDeliveryFixtures;
    seed.set(
      `course_enrollments/${guestPendingEnrollment.enrollmentId}`,
      guestPendingEnrollment as Record<string, unknown>
    );
    const firestore = fakeFirestore(seed);
    await expect(
      syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
        rawEnrollmentId: guestPendingEnrollment.enrollmentId,
      })
    ).resolves.toBe('not_applicable');

    await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
      rawEnrollmentId: confirmedEnrollment.enrollmentId,
      now: new Date('2026-01-10T00:00:00.000Z'),
    });
    const completedAt = timestampFromDate(new Date('2026-02-03T09:00:00.000Z'));
    seed.set(
      `course_enrollments/${confirmedEnrollment.enrollmentId}`,
      CourseEnrollmentSchema.parse({
        ...confirmedEnrollment,
        lifecycle: { status: 'completed', completedAt },
        revision: 2,
        updatedAt: completedAt,
      }) as Record<string, unknown>
    );
    await expect(
      syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
        rawEnrollmentId: confirmedEnrollment.enrollmentId,
        now: new Date('2026-02-03T09:00:00.000Z'),
      })
    ).resolves.toBe('completed');
    expect(
      seed.get(`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${confirmedEnrollment.enrollmentId}`)
    ).toMatchObject({ status: 'complete', completedReason: 'lifecycle_ineligible' });
  });

  it.each([
    {
      status: 'pending_cancellation' as const,
      lifecycle: {
        status: 'pending_cancellation' as const,
        requestedAt: timestampFromDate(new Date('2026-02-03T09:00:00.000Z')),
      },
    },
    {
      status: 'cancelled' as const,
      lifecycle: {
        status: 'cancelled' as const,
        cancelledAt: timestampFromDate(new Date('2026-02-03T09:00:00.000Z')),
        reasonCode: 'account_owner_cancelled' as const,
      },
    },
    {
      status: 'withdrawn' as const,
      lifecycle: {
        status: 'withdrawn' as const,
        withdrawnAt: timestampFromDate(new Date('2026-02-03T09:00:00.000Z')),
      },
    },
    {
      status: 'no_show' as const,
      lifecycle: {
        status: 'no_show' as const,
        noShowAt: timestampFromDate(new Date('2026-02-03T09:00:00.000Z')),
      },
    },
  ])('closes pending work when Enrollment becomes $status', async ({ lifecycle }) => {
    const seed = canonicalSeed();
    const { confirmedEnrollment } = canonicalCourseDeliveryFixtures;
    const firestore = fakeFirestore(seed);
    await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
      rawEnrollmentId: confirmedEnrollment.enrollmentId,
      now: new Date('2026-01-10T00:00:00.000Z'),
    });
    const updatedAt = timestampFromDate(new Date('2026-02-03T09:00:00.000Z'));
    seed.set(
      `course_enrollments/${confirmedEnrollment.enrollmentId}`,
      CourseEnrollmentSchema.parse({
        ...confirmedEnrollment,
        lifecycle,
        revision: 2,
        updatedAt,
      }) as Record<string, unknown>
    );
    await expect(
      syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(firestore, {
        rawEnrollmentId: confirmedEnrollment.enrollmentId,
        now: new Date('2026-02-03T09:00:00.000Z'),
      })
    ).resolves.toBe('completed');
    expect(
      seed.get(`${COURSE_ENROLLMENT_OUTCOME_WORK_COLLECTION}/${confirmedEnrollment.enrollmentId}`)
    ).toMatchObject({ status: 'complete', completedReason: 'lifecycle_ineligible' });
  });
});
